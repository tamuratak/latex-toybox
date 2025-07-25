import * as vscode from 'vscode'
import type { StepCommand } from './builder.js'
import { CompilerLogParser, LogEntry } from './compilerloglib/core.js'
import type { Completer } from '../providers/completion.js'
import type { Logger } from './logger.js'
import type { Manager } from './manager.js'
import { decodeUtf8 } from '../utils/utf8.js'

export class BuildStepLog {
    private buffer = ''
    private errorBuffer = ''
    private readonly logPanel: vscode.OutputChannel
    readonly languageId: string
    readonly uri: vscode.Uri

    constructor(step: StepCommand, {stepIndex, totalStepsLength}: {stepIndex: number, totalStepsLength: number}) {
        const name = `LaTeX Compiler Log: ${stepIndex} of ${totalStepsLength} ${step.name}`
        const languageId = this.detectLanguageId(step)
        this.languageId = languageId
        this.logPanel = this.createPanel(name, languageId)
        this.uri = vscode.Uri.parse(`output:extension-output-tamuratak.latex-toybox-%23${stepIndex}-${name}`, true)
    }

    private createPanel(name: string, languageId: string): vscode.OutputChannel {
        const panel = vscode.window.createOutputChannel(name, languageId)
        return panel
    }

    private detectLanguageId(_step: StepCommand): string {
        return 'plain'
    }

    get stderr() {
        return this.errorBuffer
    }

    get stdout() {
        return this.buffer
    }

    append(message: Uint8Array) {
        this.buffer += decodeUtf8(message)
        this.logPanel.append(message.toString())
    }

    appendError(message: Uint8Array) {
        this.errorBuffer += decodeUtf8(message)
    }

    dispose() {
        this.logPanel.dispose()
    }

    show(opts?: { inEditor?: boolean}) {
        if (opts?.inEditor) {
            return vscode.workspace.openTextDocument(this.uri).then((doc) => {
                return vscode.window.showTextDocument(doc, { preview: false })
            })
        } else {
            this.logPanel.show()
            return
        }
    }

}


export class CompilerLog {
    private readonly compilerLogParser: CompilerLogParser
    private stepLogs: BuildStepLog[] = []

    constructor(extension: {
        readonly extensionContext: vscode.ExtensionContext,
        readonly compilerLog: CompilerLog,
        readonly completer: Completer,
        readonly logger: Logger,
        readonly manager: Manager
    }) {
        this.compilerLogParser = new CompilerLogParser(extension)
        extension.extensionContext.subscriptions.push(
            new vscode.Disposable(() => this.dispose())
        )
    }

    createStepLog(_rootfile: string | undefined, step: StepCommand, {stepIndex, totalStepsLength}: {stepIndex: number, totalStepsLength: number}): BuildStepLog {
        const stepLog = new BuildStepLog(step, {stepIndex, totalStepsLength})
        this.stepLogs.push(stepLog)
        return stepLog
    }

    private dispose() {
        this.clear()
    }

    clear() {
        this.stepLogs.forEach(stepLog => stepLog.dispose())
        this.stepLogs = []
    }

    parse(stepLog: BuildStepLog, rootFile?: string) {
        return this.compilerLogParser.parse(stepLog, rootFile)
    }

    showCompilerDiagnostics(compilerDiagnostics: vscode.DiagnosticCollection, buildLog: LogEntry[], source: string) {
        return this.compilerLogParser.showCompilerDiagnostics(compilerDiagnostics, buildLog, source)
    }

    get isLaTeXmkSkipped() {
        return this.compilerLogParser.isLaTeXmkSkipped
    }

    show(opts?: { inEditor?: boolean}) {
        return this.stepLogs[0]?.show(opts)
    }

}
