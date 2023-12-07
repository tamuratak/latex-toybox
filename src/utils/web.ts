import * as vscode from 'vscode'

export function isRunningOnWebWorker(): boolean {
    return vscode.env.uiKind === vscode.UIKind.Web && !vscode.env.remoteName
}
