import * as vscode from 'vscode'

export class ReferenceStore {
    readonly refCommandLocationMap: Map<string, vscode.Location[]> = new Map()
    readonly labelCommandLocationMap: Map<string, vscode.Location[]> = new Map()
    readonly citeCommandLocationMap: Map<string, vscode.Location[]> = new Map()
    readonly bibitemCommandLocationMap: Map<string, vscode.Location[]> = new Map()

    clear() {
        this.refCommandLocationMap.clear()
        this.labelCommandLocationMap.clear()
        this.citeCommandLocationMap.clear()
        this.bibitemCommandLocationMap.clear()
    }

}
