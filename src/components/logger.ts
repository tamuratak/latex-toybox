import * as vscode from 'vscode'
import { ILogger } from '../interfaces'


export class Logger implements ILogger {
    private readonly logPanel: vscode.LogOutputChannel

    constructor(extensionContextSubscriptions: vscode.ExtensionContext['subscriptions']) {
        this.logPanel = vscode.window.createOutputChannel('LaTeX Workshop', { log: true })
        extensionContextSubscriptions.push(this.logPanel)
    }

    info(message: string) {
        this.logPanel.info(message)
    }

    logCommand(message: string, command: string, args: readonly string[] = []) {
        this.info(message + ': ' + command)
        this.info(message + ' args: ' + JSON.stringify(args))
    }

    debug(message: string) {
        this.logPanel.debug(message)
    }

    error(message: string) {
        this.logPanel.error(message)
    }

    logError(e: Error) {
        this.error(e.message)
        if (e.stack) {
            this.error(e.stack)
        }
    }

    logOnRejected(e: unknown) {
        if (e instanceof Error) {
            this.logError(e)
        } else {
            this.error(String(e))
        }
    }

    showLog() {
        this.logPanel.show()
    }

}
