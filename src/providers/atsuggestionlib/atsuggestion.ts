import * as vscode from 'vscode'

import type { IProvider } from '../completionlib/interface.js'
import { escapeRegExp } from '../../utils/utils.js'
import { readFilePath } from '../../lib/lwfs/lwfs.js'
import { CommandKind } from '../completionlib/completionkind.js'


export interface AtSuggestionItemEntry {
    readonly prefix: string,
    readonly body: string,
    readonly description: string
}

type DataAtSuggestionJsonType = typeof import('../../../data/at-suggestions.json')

export class AtSuggestion implements IProvider {
    private readonly triggerCharacter: string
    private readonly escapedTriggerCharacter: string
    private readonly suggestions: vscode.CompletionItem[] = []
    readonly readyPromise: Promise<void>

    constructor(
        private readonly extension: {
            readonly extensionRoot: string
        },
        triggerCharacter: string
    ) {
        this.extension = extension
        this.triggerCharacter = triggerCharacter
        this.escapedTriggerCharacter = escapeRegExp(this.triggerCharacter)

        this.readyPromise = new Promise((resolve) => this.initialize().then(() => resolve()))

        vscode.workspace.onDidChangeConfiguration((e: vscode.ConfigurationChangeEvent) => {
            if (e.affectsConfiguration('latex-toybox.intellisense.atSuggestionJSON.replace')) {
                void this.initialize()
            }
        })
    }

    private async initialize() {
        const content = await readFilePath(`${this.extension.extensionRoot}/data/at-suggestions.json`)
        const suggestions: Record<string, AtSuggestionItemEntry> = JSON.parse(content) as DataAtSuggestionJsonType

        const suggestionReplacements = vscode.workspace.getConfiguration('latex-toybox').get('intellisense.atSuggestionJSON.replace') as Record<string, string>
        this.suggestions.length = 0
        Object.keys(suggestionReplacements).forEach(prefix => {
            const body = suggestionReplacements[prefix]
            if (body === '') {
                return
            }
            const completionItem = new vscode.CompletionItem(prefix.replace('@', this.triggerCharacter), CommandKind)
            completionItem.insertText = new vscode.SnippetString(body)
            completionItem.documentation = body
            completionItem.detail = body
            this.suggestions.push(completionItem)
        })

        Object.keys(suggestions).forEach(key => {
            const item = suggestions[key]
            if (item.prefix in suggestionReplacements) {
                return
            }
            const completionItem = new vscode.CompletionItem(item.prefix.replace('@', this.triggerCharacter), CommandKind)
            completionItem.insertText = new vscode.SnippetString(item.body)
            completionItem.documentation = new vscode.MarkdownString(item.description)
            completionItem.detail = item.description
            this.suggestions.push(completionItem)
        })
    }

    provideFrom(result: RegExpMatchArray, args: {document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext}) {
        const suggestions = this.provide(args.document, args.position)
        // Manually filter suggestions when there are several consecutive trigger characters
        const reg = new RegExp(this.escapedTriggerCharacter + '{2,}$')
        if (result[0].match(reg)) {
            const filteredSuggestions = suggestions.filter(item => item.label === result[0])
            if (filteredSuggestions.length > 0) {
                return filteredSuggestions.map(item => {
                    item.range = new vscode.Range(args.position.translate(undefined, -item.label.toString().length), args.position)
                    return item
                })
            }
        }
        return suggestions
    }

    private provide(document: vscode.TextDocument, position: vscode.Position): vscode.CompletionItem[] {
        let range: vscode.Range | undefined = undefined
        const startPos = document.lineAt(position).text.lastIndexOf(this.triggerCharacter, position.character - 1)
        if (startPos >= 0) {
            range = new vscode.Range(position.line, startPos, position.line, position.character)
        }
        this.suggestions.forEach(suggestion => {
            if (range) {
                suggestion.range = range
            }
        })
        return this.suggestions
    }

}
