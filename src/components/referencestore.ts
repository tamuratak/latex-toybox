import type * as vscode from 'vscode'
import { ReferenceUpdater } from './referencestorelib/referenceupdater.js'


export class ReferenceStore {
    readonly refCommandLocationMap: Map<string, vscode.Location[]> = new Map()
    readonly labelCommandLocationMap: Map<string, vscode.Location[]> = new Map()
    readonly citeCommandLocationMap: Map<string, vscode.Location[]> = new Map()
    readonly bibitemCommandLocationMap: Map<string, vscode.Location[]> = new Map()
    private readonly referenceUpdater: ReferenceUpdater

    constructor(extension: ConstructorParameters<typeof ReferenceUpdater>[0]) {
        this.referenceUpdater = new ReferenceUpdater(extension)
    }

    clear() {
        this.refCommandLocationMap.clear()
        this.labelCommandLocationMap.clear()
        this.citeCommandLocationMap.clear()
        this.bibitemCommandLocationMap.clear()
    }

    async update() {
        return this.referenceUpdater.update()
    }

}
