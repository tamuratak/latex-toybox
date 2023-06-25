import * as vscode from 'vscode'

import type {IProvider} from './interface'
import type { EventBus } from '../../components/eventbus'
import type { CompletionUpdater } from '../../components/completionupdater'
import type { Manager } from '../../components/manager'
import type { AuxManager } from '../../components/auxmanager'


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
        for (const [, entry] of this.labelDefinitions) {
            items.push({...entry,
                range,
                kind: vscode.CompletionItemKind.Reference,
            })
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
        return {...ret, prevIndex: auxFileStore.labelsMap.get(token)}
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
