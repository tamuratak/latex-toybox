import type * as vscode from 'vscode'

export function selectDocumentsWithId(ids: string[]): vscode.DocumentSelector {
    const selector = ids.map( (id) => {
        return { language: id }
    })
    return selector
}
