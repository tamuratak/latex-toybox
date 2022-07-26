import * as vscode from 'vscode'

import type {IProvider, ILwCompletionItem} from './interface'
import type {ManagerLocator} from '../../interfaces'

export enum GlossaryType {
    glossary,
    acronym
}

export interface GlossarySuggestion extends ILwCompletionItem {
    type: GlossaryType,
    file: string,
    position: vscode.Position
}

interface IExtension extends
    ManagerLocator { }

export class Glossary implements IProvider {
    private readonly extension: IExtension
    // use object for deduplication
    private readonly glossaries = new Map<string, GlossarySuggestion>()
    private readonly acronyms = new Map<string, GlossarySuggestion>()

    constructor(extension: IExtension) {
        this.extension = extension
    }

    provideFrom(result: RegExpMatchArray) {
        return this.provide(result)
    }

    private provide(result: RegExpMatchArray): vscode.CompletionItem[] {
        this.updateAll()
        let suggestions: Map<string, GlossarySuggestion>

        if (result[1] && result[1].match(/^ac/i)) {
            suggestions = this.acronyms
        } else {
            suggestions = new Map( [...this.acronyms, ...this.glossaries] )
        }

        // Compile the suggestion object to array
        const items = Array.from(suggestions.values())
        return items
    }

    private updateAll() {
        // Extract cached references
        const glossaryList: string[] = []

        this.extension.manager.getIncludedTeX().forEach(cachedFile => {
            const cachedGlossaries = this.extension.manager.getCachedContent(cachedFile)?.element.glossary
            if (cachedGlossaries === undefined) {
                return
            }
            cachedGlossaries.forEach(ref => {
                if (ref.type === GlossaryType.glossary) {
                    this.glossaries.set(ref.label, ref)
                } else {
                    this.acronyms.set(ref.label, ref)
                }
                glossaryList.push(ref.label)
            })
        })

        // Remove references that has been deleted
        this.glossaries.forEach((_, key) => {
            if (!glossaryList.includes(key)) {
                this.glossaries.delete(key)
            }
        })
        this.acronyms.forEach((_, key) => {
            if (!glossaryList.includes(key)) {
                this.acronyms.delete(key)
            }
        })
    }

    getEntry(token: string): GlossarySuggestion | undefined {
        this.updateAll()
        return this.glossaries.get(token) || this.acronyms.get(token)
    }


}
