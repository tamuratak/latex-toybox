import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'

import type {IProvider} from './interface'
import type {ManagerLocator} from '../../interfaces'

export interface ReferenceEntry {
    readonly file: string,
    readonly position: vscode.Position,
    prevIndex?: {refNumber: string, pageNumber: string},
    readonly range: vscode.Range | undefined,
    readonly label: string,
    documentation?: string | vscode.MarkdownString | undefined
}

export type ReferenceDocType = {
    readonly documentation: ReferenceEntry['documentation'],
    readonly file: ReferenceEntry['file'],
    readonly position: {line: number, character: number},
    readonly key: string,
    readonly label: ReferenceEntry['label'],
    readonly prevIndex: ReferenceEntry['prevIndex']
}

interface IExtension extends
    ManagerLocator { }

export class Reference implements IProvider {
    private readonly extension: IExtension
    // Here we use an object instead of an array for de-duplication
    private readonly suggestions = new Map<string, ReferenceEntry>()
    private prevIndexObj = new Map<string, {refNumber: string, pageNumber: string}>()

    constructor(extension: IExtension) {
        this.extension = extension
    }

    provideFrom(_result: RegExpMatchArray, args: {document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext}) {
        return this.provide(args)
    }

    private provide(args: {document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext}): vscode.CompletionItem[] {
        // Compile the suggestion object to array
        this.updateAll(args)
        let keys = [...this.suggestions.keys(), ...this.prevIndexObj.keys()]
        keys = Array.from(new Set(keys))
        const items: vscode.CompletionItem[] = []
        for (const key of keys) {
            const sug = this.suggestions.get(key)
            if (sug) {
                const data: ReferenceDocType = {
                    documentation: sug.documentation,
                    file: sug.file,
                    position: {
                        line: sug.position.line,
                        character: sug.position.character
                    },
                    key,
                    label: sug.label,
                    prevIndex: sug.prevIndex
                }
                sug.documentation = JSON.stringify(data)
                items.push(sug)
            } else {
                items.push({label: key})
            }
        }
        return items
    }

    getRef(token: string): ReferenceEntry | undefined {
        this.updateAll()
        return this.suggestions.get(token)
    }

    private updateAll(args?: {document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext}) {
        // Extract cached references
        const refList: string[] = []
        let range: vscode.Range | undefined = undefined
        if (args) {
            const startPos = args.document.lineAt(args.position).text.lastIndexOf('{', args.position.character)
            if (startPos < 0) {
                return
            }
            range = new vscode.Range(args.position.line, startPos + 1, args.position.line, args.position.character)
        }
        this.extension.manager.getIncludedTeX().forEach(cachedFile => {
            const cachedRefs = this.extension.manager.getCachedContent(cachedFile)?.element.reference
            if (cachedRefs === undefined) {
                return
            }
            cachedRefs.forEach(ref => {
                if (ref.range === undefined) {
                    return
                }
                this.suggestions.set(ref.label, {...ref,
                    file: cachedFile,
                    position: ref.range instanceof vscode.Range ? ref.range.start : ref.range.inserting.start,
                    range,
                    prevIndex: this.prevIndexObj.get(ref.label)
                })
                refList.push(ref.label)
            })
        })
        // Remove references that have been deleted
        this.suggestions.forEach((_, key) => {
            if (!refList.includes(key)) {
                this.suggestions.delete(key)
            }
        })
    }

    setNumbersFromAuxFile(rootFile: string) {
        const outDir = this.extension.manager.getOutDir(rootFile)
        const rootDir = path.dirname(rootFile)
        const auxFile = path.resolve(rootDir, path.join(outDir, path.basename(rootFile, '.tex') + '.aux'))
        this.suggestions.forEach((entry) => {
            entry.prevIndex = undefined
        })
        this.prevIndexObj = new Map<string, {refNumber: string, pageNumber: string}>()
        if (!fs.existsSync(auxFile)) {
            return
        }
        const newLabelReg = /^\\newlabel\{(.*?)\}\{\{(.*?)\}\{(.*?)\}/gm
        const auxContent = fs.readFileSync(auxFile, {encoding: 'utf8'})
        while (true) {
            const result = newLabelReg.exec(auxContent)
            if (result === null) {
                break
            }
            if ( result[1].endsWith('@cref') && this.prevIndexObj.has(result[1].replace('@cref', '')) ) {
                // Drop extra \newlabel entries added by cleveref
                continue
            }
            this.prevIndexObj.set(result[1], {refNumber: result[2], pageNumber: result[3]})
            const ent = this.suggestions.get(result[1])
            if (ent) {
                ent.prevIndex = {refNumber: result[2], pageNumber: result[3]}
            }
        }
    }

}
