import type * as vscode from 'vscode'
import { ReferenceUpdater } from './referencestorelib/referenceupdater.js'


export class ReferenceStore {
    readonly refCommandLocationMap = new Map<string, vscode.Location[]>()
    readonly labelCommandLocationMap = new Map<string, vscode.Location[]>()
    readonly citeCommandLocationMap = new Map<string, vscode.Location[]>()
    readonly bibitemCommandLocationMap = new Map<string, vscode.Location[]>()
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
