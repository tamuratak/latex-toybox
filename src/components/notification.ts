import * as vscode from 'vscode'
import type { INotification, LoggerLocator } from '../interfaces'


interface IExtension extends
    LoggerLocator { }

export class Notification implements INotification {
    private readonly extension: IExtension
    readonly status: vscode.StatusBarItem

    constructor(extension: IExtension) {
        this.extension = extension
        this.status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, -10000)
        this.status.command = 'latex-workshop.actions'
        this.status.show()
        this.displayStatus('check', 'statusBar.foreground')
    }

    displayStatus(
        icon: string,
        color: string,
        message: string | undefined = undefined,
        severity: 'info' | 'warning' | 'error' = 'info',
        build: string = ''
    ) {
        this.status.text = `$(${icon})${build}`
        this.status.tooltip = message
        this.status.color = new vscode.ThemeColor(color)
        if (message === undefined) {
            return
        }
        const configuration = vscode.workspace.getConfiguration('latex-workshop')
        switch (severity) {
            case 'info':
                if (configuration.get('message.information.show')) {
                    void vscode.window.showInformationMessage(message)
                }
                break
            case 'warning':
                if (configuration.get('message.warning.show')) {
                    void vscode.window.showWarningMessage(message)
                }
                break
            case 'error':
            default:
                if (configuration.get('message.error.show')) {
                    void vscode.window.showErrorMessage(message)
                }
                break
        }
    }

    showErrorMessage(message: string, ...args: string[]): Thenable<string | undefined> | undefined {
        const configuration = vscode.workspace.getConfiguration('latex-workshop')
        if (configuration.get('message.error.show')) {
            return vscode.window.showErrorMessage(message, ...args)
        } else {
            return undefined
        }
    }

    showErrorMessageWithCompilerLogButton(message: string) {
        const res = this.showErrorMessage(message, 'Open compiler log')
        if (res) {
            return res.then(option => {
                switch (option) {
                    case 'Open compiler log': {
                        this.extension.logger.showCompilerLog()
                        break
                    }
                    default: {
                        break
                    }
                }
            })
        }
        return
    }

    showErrorMessageWithExtensionLogButton(message: string) {
        const res = this.showErrorMessage(message, 'Open LaTeX Workshop log')
        if (res) {
            return res.then(option => {
                switch (option) {
                    case 'Open LaTeX Workshop log': {
                        this.extension.logger.showLog()
                        break
                    }
                    default: {
                        break
                    }
                }
            })
        }
        return
    }

}
