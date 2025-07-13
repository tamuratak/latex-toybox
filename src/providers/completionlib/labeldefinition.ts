import * as vscode from 'vscode'

import type {IProvider} from './interface.js'
import type { EventBus } from '../../components/eventbus.js'
import type { CompletionUpdater } from '../../components/completionupdater.js'
import type { Manager } from '../../components/manager.js'
import type { AuxManager } from '../../components/auxmanager.js'
import { ReferenceKind } from './completionkind.js'


export interface LabelDefinitionElement {
    readonly range: vscode.Range,
    readonly label: string,
    readonly documentation: string
}

export interface LabelDefinitionStored {
    readonly file: string,
    readonly position: vscode.Position,
    readonly label: string,
    readonly documentation: string
}

export interface LabelDefinitionEntry extends LabelDefinitionStored {
    readonly prevIndex: {
        readonly refNumber: string,
        readonly pageNumber: string
    } | undefined
}

export class LabelDefinition implements IProvider {
    private readonly labelDefinitions = new Map<string, LabelDefinitionStored>()

    constructor(private readonly extension: {
        readonly auxManager: AuxManager,
        readonly eventBus: EventBus,
        readonly completionUpdater: CompletionUpdater,
        readonly manager: Manager
    }) {
        extension.eventBus.completionUpdated.event(() => {
            this.updateAll()
        })
    }

    provideFrom(_result: RegExpMatchArray, args: {document: vscode.TextDocument, position: vscode.Position}) {
        return this.provide(args)
    }

    private provide(args: {document: vscode.TextDocument, position: vscode.Position}): vscode.CompletionItem[] {
        let range: vscode.Range | undefined
        if (args) {
            const startPos = args.document.lineAt(args.position).text.lastIndexOf('{', args.position.character)
            if (startPos < 0) {
                return []
            }
            range = new vscode.Range(args.position.line, startPos + 1, args.position.line, args.position.character)
        }
        const items: vscode.CompletionItem[] = []
        for (const [token, entry] of this.labelDefinitions) {
            const labelDef = this.getLabelDef(token)
            const refNumber = labelDef?.prevIndex?.refNumber
            const detail = refNumber ? `(${refNumber})` : ''
            if (range) {
                items.push({...entry,
                    range,
                    detail,
                    kind: ReferenceKind,
                })
            } else {
                items.push({...entry,
                    detail,
                    kind: ReferenceKind,
                })
            }
        }
        return items
    }

    getLabelDef(token: string): LabelDefinitionEntry | undefined {
        const ret = this.labelDefinitions.get(token)
        const rootFile = this.extension.manager.rootFile
        if (!ret || !rootFile) {
            return
        }
        const auxFileStore = this.extension.auxManager.getAuxStore(rootFile)
        if (!auxFileStore) {
            return
        }
        const labelPosArray = auxFileStore.labelsMap.get(token)
        if (!labelPosArray || labelPosArray.length > 1) {
            return
        }
        return {...ret, prevIndex: labelPosArray[0]}
    }

    private updateAll() {
        this.labelDefinitions.clear()
        this.extension.manager.getIncludedTeX().forEach(cachedFile => {
            const cachedDefs = this.extension.manager.getCachedContent(cachedFile)?.element.labelDefinition
            if (cachedDefs === undefined) {
                return
            }
            cachedDefs.forEach(labelDef => {
                this.labelDefinitions.set(labelDef.label, {
                    ...labelDef,
                    file: cachedFile,
                    position: labelDef.range.start
                })
            })
        })
    }

}
