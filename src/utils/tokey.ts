import type * as vscode from 'vscode'

export function toKey(fileUri: vscode.Uri) {
    return fileUri.toString(true)
}
