import * as vscode from 'vscode'
import type { LogEntry } from './core'
import type { CompilerLog } from '../compilerlog'
import type { Completer } from '../../providers/completion'
import type { Logger } from '../logger'
import type { Manager } from '../manager'
import { inspectReadable } from '../../utils/inspect'

const multiLineWarning = /^Warning--(.+)\n--line (\d+) of file (.+)$/gm
const singleLineWarning = /^Warning--(.+) in ([^\s]+)\s*$/gm
const multiLineError = /^(.*)---line (\d+) of file (.*)\n([^]+?)\nI'm skipping whatever remains of this entry$/gm
const badCrossReference = /^(A bad cross reference---entry ".+?"\nrefers to entry.+?, which doesn't exist)$/gm
const multiLineCommandError = /^(.*)\n?---line (\d+) of file (.*)\n([^]+?)\nI'm skipping whatever remains of this command$/gm
const errorAuxFile = /^(.*)---while reading file (.*)$/gm


export class BibLogParser {
    buildLog: LogEntry[] = []
    readonly compilerDiagnostics = vscode.languages.createDiagnosticCollection('BibTeX')

    constructor(private readonly extension: {
        readonly compilerLog: CompilerLog,
        readonly completer: Completer,
        readonly logger: Logger,
        readonly manager: Manager
    }) { }

    parse(log: string, rootFile?: string) {
        if (rootFile === undefined) {
            rootFile = this.extension.manager.rootFile
        }
        if (rootFile === undefined) {
            this.extension.logger.info('How can you reach this point?')
            return
        }

        const configuration = vscode.workspace.getConfiguration('latex-toybox')
        let excludeRegexp: RegExp[]
        try {
            excludeRegexp = (configuration.get('message.bibtexlog.exclude') as string[]).map(regexp => new RegExp(regexp))
        } catch (e) {
            this.extension.logger.info(`latex-toybox.message.bibtexlog.exclude is invalid: ${inspectReadable(e)}`)
            return
        }
        this.buildLog = []

        let result: RegExpExecArray | null
        while ((result = singleLineWarning.exec(log))) {
            const location = this.findKeyLocation(result[2])
            if (location) {
                this.pushLog('warning', location.file, result[1],location.line, excludeRegexp )
            }
        }
        while ((result = multiLineWarning.exec(log))) {
            const filename = this.resolveBibFile(result[3], rootFile)
            this.pushLog('warning', filename, result[1], parseInt(result[2], 10), excludeRegexp)
        }
        while ((result = multiLineError.exec(log))) {
            const filename = this.resolveBibFile(result[3], rootFile)
            this.pushLog('error', filename, result[1], parseInt(result[2], 10), excludeRegexp)
        }
        while ((result = multiLineCommandError.exec(log))) {
            const filename = this.resolveBibFile(result[3], rootFile)
            this.pushLog('error', filename, result[1], parseInt(result[2], 10), excludeRegexp)
        }
        while ((result = badCrossReference.exec(log))) {
            this.pushLog('error', rootFile, result[1], 1, excludeRegexp)
        }
        while ((result = errorAuxFile.exec(log))) {
            const filename = this.resolveAuxFile(result[2], rootFile)
            this.pushLog('error', filename, result[1], 1, excludeRegexp)
        }

        this.extension.logger.info(`BibTeX log parsed with ${this.buildLog.length} messages.`)
        return this.extension.compilerLog.showCompilerDiagnostics(this.compilerDiagnostics, this.buildLog, 'BibTeX')
    }

    private pushLog(type: string, file: string, message: string, line: number, excludeRegexp: RegExp[]) {
        for (const regexp of excludeRegexp) {
            if (message.match(regexp)) {
                return
            }
        }
        this.buildLog.push({ type, file, text: message, line})
    }

    private resolveAuxFile(filename: string, rootFile: string): string {
        filename = filename.replace(/\.aux$/, '.tex')
        if (!this.extension.manager.getCachedContent(rootFile)) {
            return filename
        }
        const texFiles = this.extension.manager.getIncludedTeX(rootFile)
        for (const tex of texFiles) {
            if (tex.endsWith(filename)) {
                return tex
            }
        }
        this.extension.logger.info(`Cannot resolve file while parsing BibTeX log: ${filename}`)
        return filename
    }

    private resolveBibFile(filename: string, rootFile: string): string {
        if (!this.extension.manager.getCachedContent(rootFile)) {
            return filename
        }
        const bibFiles = this.extension.manager.getIncludedBib(rootFile)
        for (const bib of bibFiles) {
            if (bib.endsWith(filename)) {
                return bib
            }
        }
        this.extension.logger.info(`Cannot resolve file while parsing BibTeX log: ${filename}`)
        return filename
    }

    private findKeyLocation(key: string): {file: string, line: number} | undefined {
        const entry = this.extension.completer.citation.getEntry(key)
        if (entry) {
            const file = entry.file
            const line = entry.position.line + 1
            return {file, line}
        } else {
            this.extension.logger.info(`Cannot find key when parsing BibTeX log: ${key}`)
            return undefined
        }
    }

}

