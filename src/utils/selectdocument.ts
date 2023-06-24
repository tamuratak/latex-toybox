import type * as vscode from 'vscode'

export function selectDocumentsWithId(ids: string[]): vscode.DocumentSelector {
    const selector = ids.map( (id) => {
        return { scheme: 'file', language: id }
    })
    return selector
}
