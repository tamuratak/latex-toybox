import * as vscode from 'vscode'
import * as path from 'path'

import type {IProvider} from './interface'
import { CompletionUpdaterLocator, ManagerLocator } from '../../interfaces'
import { readFilePath } from '../../lib/lwfs/lwfs'

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

interface IExtension extends
    CompletionUpdaterLocator,
    ManagerLocator { }

export class LabelDefinition implements IProvider {
    private readonly extension: IExtension
    private readonly labelDefinitions = new Map<string, LabelDefinitionStored>()
    private readonly prevIndexMap = new Map<string, {refNumber: string, pageNumber: string}>()

    constructor(extension: IExtension) {
        this.extension = extension
        this.extension.completionUpdater.onDidUpdate(() => {
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
        if (ret) {
            return {...ret, prevIndex: this.prevIndexMap.get(token)}
        }
        return
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

    async setNumbersFromAuxFile(rootFile: string) {
        const outDir = this.extension.manager.getOutDir(rootFile)
        const rootDir = path.dirname(rootFile)
        const auxFile = path.resolve(rootDir, path.join(outDir, path.basename(rootFile, '.tex') + '.aux'))
        this.prevIndexMap.clear()
        const newLabelReg = /^\\newlabel\{(.*?)\}\{\{(.*?)\}\{(.*?)\}/gm
        try {
            const auxContent = await readFilePath(auxFile)
            while (true) {
                const result = newLabelReg.exec(auxContent)
                if (result === null) {
                    break
                }
                if ( result[1].endsWith('@cref') && this.prevIndexMap.has(result[1].replace('@cref', '')) ) {
                    // Drop extra \newlabel entries added by cleveref
                    continue
                }
                this.prevIndexMap.set(result[1], {refNumber: result[2], pageNumber: result[3]})
            }
        } catch {
            // Ignore error
        }
    }

}
