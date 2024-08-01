import * as vscode from 'vscode'
import * as path from 'node:path'
import * as os from 'node:os'

import type { ILinter } from '../linter.js'
import { LinterUtil } from './linterutil.js'
import { convertFilenameEncoding } from '../../utils/convertfilename.js'
import { existsPath, readFilePath } from '../../lib/lwfs/lwfs.js'
import type { Logger } from '../logger.js'
import type { Manager } from '../manager.js'
import { inspectReadable } from '../../utils/inspect.js'
import { byteLengthAsUtf8 } from '../../utils/utils.js'


interface ChkTeXLogEntry {
    readonly file: string,
    readonly line: number,
    readonly column: number,
    readonly length: number,
    readonly type: string,
    readonly code: number,
    readonly text: string
}

const DIAGNOSTIC_SEVERITY: Record<string, vscode.DiagnosticSeverity> = {
    'typesetting': vscode.DiagnosticSeverity.Information,
    'warning': vscode.DiagnosticSeverity.Warning,
    'error': vscode.DiagnosticSeverity.Error,
}

export class ChkTeX implements ILinter {
    readonly #linterName = 'ChkTeX'
    readonly linterDiagnostics: vscode.DiagnosticCollection = vscode.languages.createDiagnosticCollection(this.#linterName)
    readonly #linterUtil: LinterUtil

    constructor(private readonly extension: {
        readonly logger: Logger,
        readonly manager: Manager
    }) {
        this.#linterUtil = new LinterUtil(extension)
    }

    async lintRootFile() {
        this.extension.logger.info('Linter for root file started.')
        if (this.extension.manager.rootFile === undefined) {
            this.extension.logger.info('No root file found for linting.')
            return
        }
        const filePath = this.extension.manager.rootFile
        const requiredArgs = ['-f%f:%l:%c:%d:%k:%n:%m\n', filePath]

        const stdout = await this.chktexWrapper('root', vscode.Uri.file(filePath), filePath, requiredArgs, undefined)
        if (stdout === undefined) { // It's possible to have empty string as output
            return
        }

        const tabSize = await this.getChktexrcTabSize(filePath)
        return this.parseLog(stdout, undefined, tabSize)
    }

    private async chktexWrapper(linterid: string, configScope: vscode.ConfigurationScope, filePath: string, requiredArgs: string[], content?: string): Promise<string | undefined> {
        const configuration = vscode.workspace.getConfiguration('latex-toybox', configScope)
        const command = configuration.get('linting.chktex.exec.path') as string
        const args = [...(configuration.get('linting.chktex.exec.args') as string[])]
        if (!args.includes('-l')) {
            const rcPath = await this.rcPath()
            if (rcPath) {
                args.push('-l', rcPath)
            }
        }

        let stdout: string | undefined
        try {
            stdout = await this.#linterUtil.processWrapper(linterid, command, args.concat(requiredArgs).filter(arg => arg !== ''), {cwd: path.dirname(filePath)}, content)
        } catch (err) {
            this.extension.logger.error(`chktex failed: ${inspectReadable({command, args, err})}`)
            if (err instanceof Object && 'stdout' in err) {
                stdout = err.stdout as string
            }
        }

        return stdout
    }

    private async rcPath() {
        let rcPath: string
        // 0. root file folder
        const root = this.extension.manager.rootFile
        if (root) {
            rcPath = path.resolve(path.dirname(root), './.chktexrc')
        } else {
            return
        }
        if (await existsPath(rcPath)) {
            return rcPath
        }

        // 1. project root folder
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
        if (workspaceFolder) {
            rcPath = path.resolve(workspaceFolder.uri.fsPath, './.chktexrc')
        }
        if (await existsPath(rcPath)) {
            return rcPath
        }
        return undefined
    }

    private async globalRcPath() {
        const rcPathArray: string[] = []
        if (os.platform() === 'win32') {
            if (process.env['CHKTEXRC']) {
                rcPathArray.push(path.join(process.env['CHKTEXRC'], 'chktexrc'))
            }
            if (process.env['CHKTEX_HOME']) {
                rcPathArray.push(path.join(process.env['CHKTEX_HOME'], 'chktexrc'))
            }
            if (process.env['EMTEXDIR']) {
                rcPathArray.push(path.join(process.env['EMTEXDIR'], 'data', 'chktexrc'))
            }
        } else {
            if (process.env['HOME']) {
                rcPathArray.push(path.join(process.env['HOME'], '.chktexrc'))
            }
            if (process.env['LOGDIR']) {
                rcPathArray.push(path.join(process.env['LOGDIR'], '.chktexrc'))
            }
            if (process.env['CHKTEXRC']) {
                rcPathArray.push(path.join(process.env['CHKTEXRC'], '.chktexrc'))
            }
        }
        for (const rcPath of rcPathArray) {
            if (await existsPath(rcPath)) {
                return rcPath
            }
        }
        return
    }

    private async getChktexrcTabSize(file: string): Promise<number | undefined> {
        const configuration = vscode.workspace.getConfiguration('latex-toybox', vscode.Uri.file(file))
        const args = configuration.get('linting.chktex.exec.args') as string[]
        let filePath: string | undefined
        if (args.includes('-l')) {
            const idx = args.indexOf('-l')
            if (idx >= 0) {
                const rcpath = args[idx+1]
                if (await existsPath(rcpath)) {
                    filePath = rcpath
                }
            }
        } else {
            if (this.rcPath) {
                filePath = await this.rcPath()
            } else {
                filePath = await this.globalRcPath()
            }
        }
        if (!filePath) {
            this.extension.logger.info('The .chktexrc file not found.')
            return
        }
        const rcFile = await readFilePath(filePath)
        const reg = /^\s*TabSize\s*=\s*(\d+)\s*$/m
        const match = reg.exec(rcFile)
        if (match) {
            const ret = Number(match[1])
            this.extension.logger.info(`TabSize and .chktexrc: ${ret}, ${filePath}`)
            return ret
        }
        this.extension.logger.info(`TabSize not found in the .chktexrc file: ${filePath}`)
        return
    }

    async parseLog(log: string, singleFileOriginalPath?: string, tabSizeArg?: number) {
        const re = /^(.*?):(\d+):(\d+):(\d+):(.*?):(\d+):(.*?)$/gm
        const linterLog: ChkTeXLogEntry[] = []
        let match = re.exec(log)
        while (match) {
            // This log may be for a single file in memory, in which case we override the
            // path with what is provided
            let filePath = singleFileOriginalPath ? singleFileOriginalPath : match[1]
            if (!path.isAbsolute(filePath) && this.extension.manager.rootDir !== undefined) {
                filePath = path.resolve(this.extension.manager.rootDir, filePath)
            }
            const line = parseInt(match[2])
            const column = await this.callConvertColumn(parseInt(match[3]), filePath, line, tabSizeArg)
            linterLog.push({
                file: filePath,
                line,
                column,
                length: parseInt(match[4]),
                type: match[5].toLowerCase(),
                code: parseInt(match[6]),
                text: `${match[6]}: ${match[7]}`
            })
            match = re.exec(log)
        }
        this.extension.logger.info(`Linter log parsed with ${linterLog.length} messages.`)
        if (singleFileOriginalPath === undefined) {
            // A full lint of the project has taken place - clear all previous results.
            this.linterDiagnostics.clear()
        } else if (linterLog.length === 0) {
            // We are linting a single file and the new log is empty for it -
            // clean existing records.
            this.linterDiagnostics.set(vscode.Uri.file(singleFileOriginalPath), [])
        }
        return this.showLinterDiagnostics(linterLog)
    }

    private async callConvertColumn(column: number, filePathArg: string, line: number, tabSizeArg?: number): Promise<number> {
        const configuration = vscode.workspace.getConfiguration('latex-toybox', this.extension.manager.getWorkspaceFolderRootDir())
        if (!configuration.get('linting.chktex.convertOutput.column.enabled', true)) {
            return column
        }
        const filePath = await convertFilenameEncoding(filePathArg)
        if (!filePath){
            this.extension.logger.error(`Stop converting chktex's column numbers. File not found: ${filePathArg}`)
            return column
        }
        const content = await readFilePath(filePath)
        const lineString = content.split('\n')[line-1]
        let tabSize: number | undefined
        const tabSizeConfig = configuration.get('linting.chktex.convertOutput.column.chktexrcTabSize', -1)
        if (tabSizeConfig >= 0) {
            tabSize = tabSizeConfig
        } else {
            tabSize = tabSizeArg
        }
        if (lineString === undefined) {
            this.extension.logger.error(`Stop converting chktex's column numbers. Invalid line number: ${line}`)
            return column
        }
        return this.convertColumn(column, lineString, tabSize)
    }

    /**
     * @param colArg One-based value.
     * @param tabSize The default value used by chktex is 8.
     * @returns One-based value.
     */
    private convertColumn(colArg: number, lineString: string, tabSize = 8): number {
        const col = colArg - 1
        // We assume the text file is encoded in UTF-8.
        const charByteArray = Array.from(lineString).map((c) => byteLengthAsUtf8(c))
        let i = 0
        let pos = 0
        while (i < charByteArray.length) {
            if (col <= pos) {
                break
            }
            if (lineString[i] === '\t') {
                pos += tabSize
            } else {
                pos += charByteArray[i]
            }
            i += 1
        }
        return i + 1
    }

    private async showLinterDiagnostics(linterLog: ChkTeXLogEntry[]) {
        const diagsCollection = new Map<string, vscode.Diagnostic[]>()
        for (const origItem of linterLog) {
            const item = this.tweakChktexLogEntry(origItem)
            if (!item) {
                continue
            }
            const range = new vscode.Range(
                new vscode.Position(item.line - 1, item.column - 1),
                new vscode.Position(item.line - 1, item.column - 1 + item.length)
            )
            const severity = DIAGNOSTIC_SEVERITY[item.type] || vscode.DiagnosticSeverity.Error
            const diag = new vscode.Diagnostic(range, item.text, severity)
            diag.code = item.code
            diag.source = this.#linterName
            let diagArray = diagsCollection.get(item.file)
            if (!diagArray) {
                diagArray = []
                diagsCollection.set(item.file, diagArray)
            }
            diagArray.push(diag)
        }
        const configuration = vscode.workspace.getConfiguration('latex-toybox')
        const convEnc = configuration.get('message.convertFilenameEncoding') as boolean
        for (const [file, diagArray] of diagsCollection) {
            // Only report ChkTeX errors on TeX files. We should avoid
            // reporting errors in .sty files, which are irrelevant for most users.
            if (['.tex', '.bbx', '.cbx', '.dtx'].includes(path.extname(file))) {
                let convFile: string | undefined
                if (!await existsPath(file) && convEnc) {
                    convFile = await convertFilenameEncoding(file)
                }
                convFile ||= file
                this.linterDiagnostics.set(vscode.Uri.file(convFile), diagArray)
            }
        }
    }

    private tweakChktexLogEntry(origEntry: ChkTeXLogEntry): ChkTeXLogEntry | undefined {
        let entry = {...origEntry}

        if (entry.code === 9) {
            if (entry.text.startsWith('9: `}\' expected,')) {
                entry.type = 'error'
            } else {
                return
            }
        }

        if (entry.code === 10) {
            if (entry.text.includes('}')) {
                entry.type = 'error'
            }
        }

        if ([9, 10, 15].includes(entry.code) && entry.length === 1) {
            entry = {
                ...entry,
                length: 3,
                column: Math.max(1, entry.column - 1),
            }
        }

        return entry
    }

}
