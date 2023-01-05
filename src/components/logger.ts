import * as vscode from 'vscode'
import type {ILogger} from '../interfaces'

export class Logger implements ILogger {
    private readonly logPanel: vscode.LogOutputChannel
    private readonly compilerLogPanel: vscode.OutputChannel

    constructor() {
        this.logPanel = vscode.window.createOutputChannel('LaTeX Workshop', { log: true })
        this.compilerLogPanel = vscode.window.createOutputChannel('LaTeX Compiler')
        this.compilerLogPanel.append('Ready')

    }

    info(message: string) {
        const configuration = vscode.workspace.getConfiguration('latex-workshop')
        if (configuration.get('message.log.show')) {
            this.logPanel.info(message)
        }
    }

    logCommand(message: string, command: string, args: string[] = []) {
        this.info(message + ': ' + command)
        this.info(message + ' args: ' + JSON.stringify(args))
    }

    debug(message: string) {
        this.logPanel.debug(message)
    }

    addCompilerMessage(message: string) {
        this.compilerLogPanel.append(message)
    }

    logError(e: Error) {
        this.info(e.message)
        if (e.stack) {
            this.info(e.stack)
        }
    }

    logOnRejected(e: unknown) {
        if (e instanceof Error) {
            this.logError(e)
        } else {
            this.info(String(e))
        }
    }

    clearCompilerMessage() {
        this.compilerLogPanel.clear()
    }

    showLog() {
        this.logPanel.show()
    }

    showCompilerLog() {
        this.compilerLogPanel.show()
    }

}
