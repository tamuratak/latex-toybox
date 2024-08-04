import * as vscode from 'vscode'
import type { StepCommand } from './builder.js'
import { CompilerLogParser, LogEntry } from './compilerloglib/core.js'
import type { Completer } from '../providers/completion.js'
import type { Logger } from './logger.js'
import type { Manager } from './manager.js'

export class BuildStepLog {
    private buffer = ''
    private errorBuffer = ''
    private readonly logPanel: vscode.OutputChannel
    readonly languageId: string

    constructor(step: StepCommand, {stepIndex, totalStepsLength}: {stepIndex: number, totalStepsLength: number}) {
        const name = `LaTeX Compiler Log: ${stepIndex} of ${totalStepsLength} ${step.name}`
        const languageId = this.detectLanguageId(step)
        this.languageId = languageId
        this.logPanel = this.createPanel(name, languageId)
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

    append(message: string) {
        this.buffer += message
        this.logPanel.append(message)
    }

    appendError(message: string) {
        this.errorBuffer += message
    }

    dispose() {
        this.logPanel.dispose()
    }

    show() {
        this.logPanel.show()
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

    show() {
        this.stepLogs[0]?.show()
    }

}
