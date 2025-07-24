import * as vscode from 'vscode'
import { ILogger } from '../interfaces.js'
import { inspectCompact, inspectReadable } from '../utils/inspect.js'


export class Logger implements ILogger {
    private readonly logPanel: vscode.LogOutputChannel
    readonly uri = vscode.Uri.parse('output:tamuratak.latex-toybox.LaTeX Toybox')

    constructor(extensionContextSubscriptions: vscode.ExtensionContext['subscriptions']) {
        this.logPanel = vscode.window.createOutputChannel('LaTeX Toybox', { log: true })
        extensionContextSubscriptions.push(this.logPanel)
    }

    info(message: string) {
        this.logPanel.info(message)
    }

    logCommand(message: string, command: string, args: readonly string[] = []) {
        this.info(message + ': ' + command)
        this.info(message + ' args: ' + inspectCompact(args))
    }

    debug(message: string) {
        this.logPanel.debug(message)
    }

    error(message: string) {
        this.logPanel.error(message)
    }

    logError(e: unknown) {
        this.error(inspectReadable(e))
    }

    showLog() {
        // return vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.parse('output:tamuratak.latex-toybox.LaTeX Toybox')))
        this.logPanel.show()
    }

}
