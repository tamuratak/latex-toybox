import type * as vscode from 'vscode'
import { ReferenceUpdater } from './referencestorelib/referenceupdater'
import type { LatexAstManagerLocator, CompleterLocator, EventBusLocator, ExtensionContextLocator, ManagerLocator, ReferenceStoreLocator } from '../interfaces'

interface IExtension extends
    ExtensionContextLocator,
    EventBusLocator,
    CompleterLocator,
    ManagerLocator,
    LatexAstManagerLocator,
    ReferenceStoreLocator { }

export class ReferenceStore {
    readonly refCommandLocationMap: Map<string, vscode.Location[]> = new Map()
    readonly labelCommandLocationMap: Map<string, vscode.Location[]> = new Map()
    readonly citeCommandLocationMap: Map<string, vscode.Location[]> = new Map()
    readonly bibitemCommandLocationMap: Map<string, vscode.Location[]> = new Map()
    private readonly referenceUpdater: ReferenceUpdater

    constructor(extension: IExtension) {
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
