import * as vscode from 'vscode'
import type { ExtensionContextLocator, ILwStatusBarItem } from '../interfaces'


interface IExtension extends
    ExtensionContextLocator { }

export class LwStatusBarItem implements ILwStatusBarItem {
    private readonly status: vscode.StatusBarItem

    constructor(extension: IExtension) {
        this.status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, -10000)
        this.status.command = 'latex-workshop.compilerlog'
        this.status.show()
        this.displayStatus('success')
        extension.extensionContext.subscriptions.push(
            new vscode.Disposable(() => this.dispose())
        )
    }

    private dispose() {
        this.status.dispose()
    }

    displayStatus(
        status: 'success' | 'fail' | 'ongoing',
        message = '',
        build = ''
    ) {
        const icon = status === 'success' ? 'check' : status === 'fail' ? 'x' : 'sync~spin'
        this.status.text = `$(${icon})${build}`
        this.status.tooltip = message
        if (status === 'fail') {
            this.status.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground')
        } else {
            this.status.backgroundColor = undefined
        }
    }

}
