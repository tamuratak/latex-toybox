import * as vscode from 'vscode'


export class LwStatusBarItem {
    private readonly status: vscode.StatusBarItem

    constructor(extension: {
        readonly extensionContext: vscode.ExtensionContext
    }) {
        this.status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, -10000)
        this.status.command = 'latex-toybox.log'
        this.status.show()
        this.displayStatus('success')
        extension.extensionContext.subscriptions.push(
            new vscode.Disposable(() => this.status.dispose())
        )
    }

    displayStatus(
        status: 'success' | 'fail' | 'ongoing',
        message = '',
        build = '',
        type: 'build' | 'other' = 'build'
    ) {
        const icon = status === 'success' ? 'check' : status === 'fail' ? 'x' : 'sync~spin'
        this.status.text = `$(${icon})${build}`
        this.status.tooltip = message
        if (status === 'fail') {
            this.status.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground')
        } else {
            this.status.backgroundColor = undefined
        }
        if (type === 'build') {
            this.status.command = 'latex-toybox.compilerlog'
        } else if (type === 'other') {
            this.status.command = 'latex-toybox.log'
        }
    }

}
