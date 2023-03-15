import * as vscode from 'vscode'

export function isPositionAtTerminator(document: vscode.TextDocument, position: vscode.Position): boolean {
    const posRange = new vscode.Range(position, position.translate(0, 1))
    const char = document.getText(posRange)
    if (char === '\\' || char === '{') {
        return true
    }
    const prevChar = getPrevChar(document, position)
    if (prevChar === '}') {
        return true
    }
    return false
}

export function getPrevChar(document: vscode.TextDocument, position: vscode.Position) {
    if (position.character > 0) {
        const prevCharRange = new vscode.Range(position.translate(0, -1), position)
        return document.getText(prevCharRange)
    } else {
        return
    }
}
