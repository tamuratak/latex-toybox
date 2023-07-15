import * as vscode from 'vscode'
import * as path from 'path'

import type { ILinter } from '../linter'
import { LinterUtil } from './linterutil'
import { convertFilenameEncoding } from '../../utils/convertfilename'
import { existsPath } from '../../lib/lwfs/lwfs'
import type { Logger } from '../logger'
import type { Manager } from '../manager'


interface LaCheckLogEntry {
    readonly file: string,
    readonly line: number,
    readonly text: string
}

export class LaCheck implements ILinter {
    readonly #linterName = 'LaCheck'
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

        const stdout = await this.lacheckWrapper('root', vscode.Uri.file(filePath), filePath, undefined)
        if (stdout === undefined) { // It's possible to have empty string as output
            return
        }

        return this.parseLog(stdout)
    }

    private async lacheckWrapper(linterid: string, configScope: vscode.ConfigurationScope, filePath: string, content?: string): Promise<string | undefined> {
        const configuration = vscode.workspace.getConfiguration('latex-toybox', configScope)
        const command = configuration.get('linting.lacheck.exec.path') as string

        let stdout: string
        try {
            stdout = await this.#linterUtil.processWrapper(linterid, command, [filePath], {cwd: path.dirname(filePath)}, content)
        } catch (err: any) {
            if ('stdout' in err) {
                stdout = err.stdout as string
            } else {
                return undefined
            }
        }

        return stdout
    }

    parseLog(log: string, filePath?: string) {
        const linterLog: LaCheckLogEntry[] = []
        const lines = log.split('\n')
        const baseDir = path.dirname(filePath || this.extension.manager.rootFile || '.')
        for (let index = 0; index < lines.length; index++) {
            const logLine = lines[index]
            const re = /"(.*?)",\sline\s(\d+):\s(<-\s)?(.*)/g
            const match = re.exec(logLine)
            if (!match) {
                continue
            }
            if (match[3] === '<- ') {
                const nextLineRe = /.*line\s(\d+).*->\s(.*)/g
                const nextLineMatch = nextLineRe.exec(lines[index+1])
                if (nextLineMatch) {
                    linterLog.push({
                        file: path.resolve(baseDir, match[1]),
                        line: parseInt(match[2]),
                        text: `${match[4]} -> ${nextLineMatch[2]} at Line ${nextLineMatch[1]}`
                    })
                    index++
                } else {
                    linterLog.push({
                        file: path.resolve(baseDir, match[1]),
                        line: parseInt(match[2]),
                        text: match[4]
                    })
                }
            } else {
                linterLog.push({
                    file: path.resolve(baseDir, match[1]),
                    line: parseInt(match[2]),
                    text: match[4]
                })
            }
        }
        this.extension.logger.info(`Linter log parsed with ${linterLog.length} messages.`)
        this.linterDiagnostics.clear()
        return this.showLinterDiagnostics(linterLog)
    }

    private async showLinterDiagnostics(linterLog: LaCheckLogEntry[]) {
        const diagsCollection = Object.create(null) as { [key: string]: vscode.Diagnostic[] }
        for (const item of linterLog) {
            const range = new vscode.Range(
                new vscode.Position(item.line - 1, 0),
                new vscode.Position(item.line - 1, 65535)
            )
            const diag = new vscode.Diagnostic(range, item.text, vscode.DiagnosticSeverity.Warning)
            diag.source = this.#linterName
            if (diagsCollection[item.file] === undefined) {
                diagsCollection[item.file] = []
            }
            diagsCollection[item.file].push(diag)
        }
        const configuration = vscode.workspace.getConfiguration('latex-toybox')
        const convEnc = configuration.get('message.convertFilenameEncoding') as boolean
        for (const file in diagsCollection) {
            let file1 = file
            if (['.tex', '.bbx', '.cbx', '.dtx'].includes(path.extname(file))) {
                // Only report LaCheck errors on TeX files. This is done to avoid
                // reporting errors in .sty files, which are irrelevant for most users.
                if (!await existsPath(file1) && convEnc) {
                    const f = await convertFilenameEncoding(file1)
                    if (f !== undefined) {
                        file1 = f
                    }
                }
                this.linterDiagnostics.set(vscode.Uri.file(file1), diagsCollection[file])
            }
        }
    }
}
