import * as vscode from 'vscode'

export function isPositionAtTerminator(document: vscode.TextDocument, position: vscode.Position): boolean {
    const posRange = new vscode.Range(position, position.translate(0, 1))
    const char = document.getText(posRange)
    if (char === '\\' || char === '{') {
        return true
    }
    if (position.character > 0) {
        const prevCharRange = new vscode.Range(position.translate(0, -1), position)
        const prevChar = document.getText(prevCharRange)
        if (prevChar === '}') {
            return true
        }
    }
    return false
}
