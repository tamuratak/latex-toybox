import * as vscode from 'vscode'

// Workaround for https://github.com/microsoft/vscode/issues/176154
export function sanitizedReplacingItem(label: string, document: vscode.TextDocument, replaceRange: vscode.Range, newString: string, position: vscode.Position) {
    const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Issue)
    if (replaceRange.contains(position)) {
        item.insertText = newString
        item.range = replaceRange
        item.filterText = document.getText(replaceRange)
        item.additionalTextEdits = []
    } else {
        const replaceCommand = vscode.TextEdit.replace(replaceRange, newString)
        item.insertText = ''
        item.additionalTextEdits = [replaceCommand]
    }
    return item
}

// Workaround for https://github.com/microsoft/vscode/issues/176154
export function sanitizedReplacingItemFilterable(label: string, _: vscode.TextDocument, replaceRange: vscode.Range, newString: string, position: vscode.Position) {
    const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Issue)
    if (replaceRange.contains(position)) {
        const leditRange = new vscode.Range(replaceRange.start, position)
        const leditString = newString.substring(0, position.character - replaceRange.start.character)
        const edit = vscode.TextEdit.replace(leditRange, leditString)
        item.insertText = newString.substring(position.character - replaceRange.start.character)
        item.additionalTextEdits = [edit]
    } else {
        const replaceCommand = vscode.TextEdit.replace(replaceRange, newString)
        item.insertText = ''
        item.additionalTextEdits = [replaceCommand]
    }
    return item
}

// Workaround for https://github.com/microsoft/vscode/issues/176154
export function sanitizedRemovingItem(label: string, document: vscode.TextDocument, removeRange: vscode.Range, position: vscode.Position) {
    const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Issue)
    if (removeRange.contains(position)) {
        item.insertText = ''
        item.range = removeRange
        item.filterText = document.getText(removeRange)
        item.additionalTextEdits = []
    } else {
        const removeCommand = vscode.TextEdit.delete(removeRange)
        item.insertText = ''
        item.additionalTextEdits = [removeCommand]
    }
    return item
}
