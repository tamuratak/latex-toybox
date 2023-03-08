import * as vscode from 'vscode'

// Workaround for https://github.com/microsoft/vscode/issues/176154
export function sanitizeReplace(leftRange: vscode.Range, leftString: string, position: vscode.Position) {
    if (position.character - leftRange.start.character > leftString.length) {
        return {
            leditRange: leftRange,
            leditString: leftString,
            insertText: ''
        }
    } else {
        return {
            leditRange: new vscode.Range(leftRange.start, position),
            leditString: leftString.substring(0, position.character - leftRange.start.character),
            insertText: leftString.substring(position.character - leftRange.start.character)
        }
    }
}
