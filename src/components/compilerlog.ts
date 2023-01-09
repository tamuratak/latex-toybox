import * as vscode from 'vscode'
import type { CompilerLogLocator, CompleterLocator, ICompilerLog, LoggerLocator, ManagerLocator } from '../interfaces'
import type { StepCommand } from './builder'
import { CompilerLogParser, LogEntry } from './compilerloglib/core'

export class BuildStepLog {
    private buffer: string = ''
    private errorBuffer: string = ''
    readonly panelUri: vscode.Uri
    private readonly logPanel: vscode.OutputChannel
    readonly languageId: string

    constructor(count: number, step: StepCommand, stepIndex: number, totalSteps: number) {
        const name = `/LaTeX Compiler Log: ${stepIndex + 1} of ${totalSteps} ${step.name}`
        const languageId = this.detectLanguageId(step)
        this.languageId = languageId
        this.panelUri = this.createPanelUri(count, name)
        this.logPanel = this.createPanel(name, languageId)
    }

    private createPanel(name: string, languageId: string): vscode.OutputChannel {
        const panel = vscode.window.createOutputChannel(name, languageId)
        return panel
    }

    private createPanelUri(count: number, name: string): vscode.Uri {
        return vscode.Uri.parse(`output:extension-output-James-Yu.latex-workshop-%23${count}-${name}`, true)
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

interface IExtension extends
    CompilerLogLocator,
    CompleterLocator,
    LoggerLocator,
    ManagerLocator { }

export class CompilerLog implements ICompilerLog {
    private readonly compilerLogParser: CompilerLogParser
    private stepLogs: BuildStepLog[] = []
    private count = 1

    constructor(extension: IExtension) {
        this.compilerLogParser = new CompilerLogParser(extension)
    }

    createStepLog(_rootfile: string | undefined, steps: StepCommand[], stepIndex: number): BuildStepLog {
        this.count += 1
        const stepLog = new BuildStepLog(this.count, steps[stepIndex], stepIndex, steps.length)
        this.stepLogs.push(stepLog)
        return stepLog
    }

    dispose() {
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
