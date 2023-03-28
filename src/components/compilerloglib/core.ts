import * as vscode from 'vscode'

import { convertFilenameEncoding } from '../../utils/convertfilename'
import { LatexLogParser } from './latexlogparser'
import { BibLogParser } from './biblogparser'
import { existsPath } from '../../lib/lwfs/lwfs'
import { BuildStepLog } from '../compilerlog'
import type { CompilerLogLocator, CompleterLocator, LoggerLocator, ManagerLocator } from '../../interfaces'

// Notice that 'Output written on filename.pdf' isn't output in draft mode.
// https://github.com/James-Yu/LaTeX-Workshop/issues/2893#issuecomment-936312853
const latexPattern = /^Output\swritten\son\s(.*)\s\(.*\)\.$/gm
const latexFatalPattern = /Fatal error occurred, no output PDF file produced!/gm

const latexmkPattern = /^Latexmk:\sapplying\srule/gm
const latexmkLog = /^Latexmk:\sapplying\srule/
const latexmkLogLatex = /^Latexmk:\sapplying\srule\s'(pdf|lua|xe)?latex'/
const latexmkUpToDate = /^Latexmk: All targets \(.*\) are up-to-date/m

const texifyPattern = /^running\s(pdf|lua|xe)?latex/gm
const texifyLog = /^running\s((pdf|lua|xe)?latex|miktex-bibtex)/
const texifyLogLatex = /^running\s(pdf|lua|xe)?latex/

const bibtexPattern = /^This is BibTeX, Version.*$/m

const DIAGNOSTIC_SEVERITY: { [key: string]: vscode.DiagnosticSeverity } = {
    'typesetting': vscode.DiagnosticSeverity.Information,
    'warning': vscode.DiagnosticSeverity.Warning,
    'error': vscode.DiagnosticSeverity.Error,
}

export interface LogEntry {
    readonly type: string,
    readonly file: string,
    text: string,
    line: number,
    errorPosText?: string
}

interface IExtension extends
    CompilerLogLocator,
    CompleterLocator,
    LoggerLocator,
    ManagerLocator { }

export class CompilerLogParser {
    private readonly latexLogParser: LatexLogParser
    private readonly bibLogParser: BibLogParser
    private readonly extension: IExtension
    /**
     * Set true when LaTeXmk did nothing because all targets are up-to-date.
     */
    isLaTeXmkSkipped: boolean = false

    constructor(extension: IExtension) {
        this.latexLogParser = new LatexLogParser(extension)
        this.bibLogParser = new BibLogParser(extension)
        this.extension = extension
    }

    parse(stepLog: BuildStepLog, rootFile?: string) {
        let log = stepLog.stdout
        this.isLaTeXmkSkipped = false
        // Canonicalize line-endings
        log = log.replace(/(\r\n)|\r/g, '\n')

        if (log.match(bibtexPattern)) {
            if (log.match(latexmkPattern)) {
                return this.bibLogParser.parse(this.trimLaTeXmkBibTeX(log), rootFile)
            } else {
                return this.bibLogParser.parse(log, rootFile)
            }
        }
        if (log.match(latexmkPattern)) {
            log = this.trimLaTeXmk(log)
        } else if (log.match(texifyPattern)) {
            log = this.trimTexify(log)
        }
        if (log.match(latexPattern) || log.match(latexFatalPattern)) {
            return this.latexLogParser.parse(log, rootFile)
        } else if (this.latexmkSkipped(log)) {
            this.isLaTeXmkSkipped = true
        }
        return
    }

    private trimLaTeXmk(log: string): string {
        return this.trimPattern(log, latexmkLogLatex, latexmkLog)
    }

    private trimLaTeXmkBibTeX(log: string): string {
        return this.trimPattern(log, bibtexPattern, latexmkLogLatex)
    }

    private trimTexify(log: string): string {
        return this.trimPattern(log, texifyLogLatex, texifyLog)
    }


    /**
     * Return the lines between the last occurrences of `beginPattern` and `endPattern`.
     * If `endPattern` is not found, the lines from the last occurrence of
     * `beginPattern` up to the end is returned.
     */
    private trimPattern(log: string, beginPattern: RegExp, endPattern: RegExp): string {
        const lines = log.split('\n')
        let startLine = -1
        let finalLine = -1
        for (let index = 0; index < lines.length; index++) {
            const line = lines[index]
            let result = line.match(beginPattern)
            if (result) {
                startLine = index
            }
            result = line.match(endPattern)
            if (result) {
                finalLine = index
            }
        }
        if (finalLine <= startLine) {
            return lines.slice(startLine).join('\n')
        } else {
            return lines.slice(startLine, finalLine).join('\n')
        }
    }


    private latexmkSkipped(log: string): boolean {
        if (log.match(latexmkUpToDate) && !log.match(latexmkPattern)) {
            void this.showCompilerDiagnostics(this.latexLogParser.compilerDiagnostics, this.latexLogParser.buildLog, 'LaTeX')
            void this.showCompilerDiagnostics(this.bibLogParser.compilerDiagnostics, this.bibLogParser.buildLog, 'BibTeX')
            return true
        }
        return false
    }

    private async getErrorPosition(item: LogEntry) {
        if (!item.errorPosText) {
            return undefined
        }
        const content = await this.extension.manager.getDirtyContent(item.file)
        if (!content) {
            return undefined
        }
        // Try to find the errorPosText in the respective line of the document
        const lines = content.split('\n')
        if (lines.length >= item.line) {
            const line = lines[item.line-1]
            let pos = line.indexOf(item.errorPosText)
            if (pos >= 0) {
                pos += item.errorPosText.length
                // Find the length of the last word in the error.
                // This is the length of the error-range
                const len = item.errorPosText.length - item.errorPosText.lastIndexOf(' ') - 1
                if (len > 0) {
                    return {start: pos - len, end: pos}
                }
            }
        }
       return undefined
    }

    async showCompilerDiagnostics(compilerDiagnostics: vscode.DiagnosticCollection, buildLog: LogEntry[], source: string) {
        compilerDiagnostics.clear()
        const newBuildLog = this.tweakLogEntries(buildLog)
        const diagsCollection = Object.create(null) as { [key: string]: vscode.Diagnostic[] }
        for (const item of newBuildLog) {
            let startChar = 0
            let endChar = 65535
            // Try to compute a more precise position
            const preciseErrorPos = await this.getErrorPosition(item)
            if (preciseErrorPos) {
                startChar = preciseErrorPos.start
                endChar = preciseErrorPos.end
            }

            const range = new vscode.Range(new vscode.Position(item.line - 1, startChar), new vscode.Position(item.line - 1, endChar))
            const diag = new vscode.Diagnostic(range, item.text, DIAGNOSTIC_SEVERITY[item.type])
            diag.source = source
            if (diagsCollection[item.file] === undefined) {
                diagsCollection[item.file] = []
            }
            diagsCollection[item.file].push(diag)
        }

        const configuration = vscode.workspace.getConfiguration('latex-workshop')
        const convEnc = configuration.get('message.convertFilenameEncoding') as boolean
        for (const file in diagsCollection) {
            let file1 = file
            if (!await existsPath(file1) && convEnc) {
                const f = await convertFilenameEncoding(file1)
                if (f !== undefined) {
                    file1 = f
                }
            }
            compilerDiagnostics.set(vscode.Uri.file(file1), diagsCollection[file])
        }
    }

    private tweakLogEntries(logEntries: LogEntry[]): LogEntry[] {
        const closingErrors = new Set<number>()
        const newLogEntries: LogEntry[] = []
        for(let logEntry of logEntries) {
            if (
                logEntry.text.includes('Paragraph ended before') ||
                logEntry.text.includes('Missing $ inserted') ||
                logEntry.text.includes('Missing \\endgroup inserted') ||
                logEntry.text.includes('Display math should end with $$')
            ) {
                if (closingErrors.has(logEntry.line)) {
                    continue
                }
                closingErrors.add(logEntry.line)
            }
            const match = /on input line (\d+) ended by \\end\{document\}/.exec(logEntry.text)
            if (match) {
                logEntry = {...logEntry}
                logEntry.line = Number(match[1])
            }
            newLogEntries.push(logEntry)
        }
        return newLogEntries
    }

}
