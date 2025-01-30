import type * as vscode from 'vscode'
import { ReferenceUpdater } from './referencestorelib/referenceupdater.js'
import type { EventBus } from './eventbus.js'
import type { Manager } from './manager.js'
import type { LatexAstManager } from './astmanager.js'


export class ReferenceStore {
    readonly refCommandLocationMap = new Map<string, vscode.Location[]>()
    readonly labelCommandLocationMap = new Map<string, vscode.Location[]>()
    readonly citeCommandLocationMap = new Map<string, vscode.Location[]>()
    readonly bibitemCommandLocationMap = new Map<string, vscode.Location[]>()
    private readonly referenceUpdater: ReferenceUpdater

    constructor(extension: {
        readonly extensionContext: vscode.ExtensionContext,
        readonly eventBus: EventBus,
        readonly manager: Manager,
        readonly latexAstManager: LatexAstManager,
        readonly referenceStore: ReferenceStore
    }) {
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
