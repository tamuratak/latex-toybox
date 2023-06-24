import * as vscode from 'vscode'
import type { Completer } from './completion'
import type { ReferenceStore } from '../components/referencestore'


export class ReferenceProvider implements vscode.ReferenceProvider {

    constructor(private readonly extension: {
        readonly completer: Completer,
        readonly referenceStore: ReferenceStore
    }) { }

    private get labelCommandLocationMap() {
        return this.extension.referenceStore.labelCommandLocationMap
    }

    private get refCommandLocationMap() {
        return this.extension.referenceStore.refCommandLocationMap
    }

    private get citeCommandLocationMap() {
        return this.extension.referenceStore.citeCommandLocationMap
    }

    private get bibitemCommandLocationMap() {
        return this.extension.referenceStore.bibitemCommandLocationMap
    }

    provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.ReferenceContext,
    ) {
        const result = this.provideForRefCommand(document, position, context)
                    || this.provideForCiteCommand(document, position, context)
                    || []
        return result
    }

    private provideForRefCommand(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.ReferenceContext,
    ) {
        const regex = /\\(?:label|eqref|ref|autoref)\{([^}]*)\}/
        const range = document.getWordRangeAtPosition(position, regex)
        if (range) {
            const result: vscode.Location[] = []
            const labelName = document.getText(range).replace(regex, '$1')
            const refs = this.refCommandLocationMap.get(labelName)
            if (refs) {
                result.push(...refs)
            }
            if (context.includeDeclaration) {
                const definitions = this.labelCommandLocationMap.get(labelName)
                if (definitions) {
                    result.push(...definitions)
                }
            }
            return result
        }
        return
    }

    private provideForCiteCommand(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.ReferenceContext,
    ): vscode.Location[] | undefined {
        const regex = /\\(?:cite)\{([^}]*)\}/
        const range = document.getWordRangeAtPosition(position, regex)
        if (range) {
            const result: vscode.Location[] = []
            const key = document.getText(range).replace(regex, '$1')
            const cites = this.citeCommandLocationMap.get(key)
            if (cites) {
                result.push(...cites)
            }
            if (context.includeDeclaration) {
                const definitions = this.bibitemCommandLocationMap.get(key) || []
                definitions.push(...this.provideCiteDefinition(key))
                result.push(...definitions)
            }
            return result
        }
        return
    }

    private provideCiteDefinition(key: string) {
        const definition = this.extension.completer.citation.getEntry(key)
        if (definition) {
            return [new vscode.Location(vscode.Uri.file(definition.file), definition.position)]
        }
        return []
    }

}
