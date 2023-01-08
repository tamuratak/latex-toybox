import * as vscode from 'vscode'
import type {ILogger} from '../interfaces'

export class Logger implements ILogger {
    private readonly logPanel: vscode.LogOutputChannel

    constructor() {
        this.logPanel = vscode.window.createOutputChannel('LaTeX Workshop', { log: true })
    }

    info(message: string) {
        this.logPanel.info(message)
    }

    logCommand(message: string, command: string, args: string[] = []) {
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
