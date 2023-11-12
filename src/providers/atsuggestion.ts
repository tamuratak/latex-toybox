import * as vscode from 'vscode'

import { AtSuggestion } from './atsuggestionlib/atsuggestion.js'
import { escapeRegExp } from '../utils/utils.js'

export class AtSuggestionCompleter implements vscode.CompletionItemProvider {
    private readonly atSuggestion: AtSuggestion
    private readonly triggerCharacter: string

    constructor(
        extension: {
            readonly extensionRoot: string
        },
        triggerCharacter: string
    ) {
        this.atSuggestion = new AtSuggestion(extension, triggerCharacter)
        this.triggerCharacter = triggerCharacter
    }

    get readyPromise() {
        return this.atSuggestion.readyPromise
    }

    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): vscode.CompletionItem[] | undefined {
        const line = document.lineAt(position).text.substring(0, position.character)
        return this.completion(line, {document, position, token, context})
    }

    private completion(
        line: string,
        args: {
            document: vscode.TextDocument,
            position: vscode.Position,
            token: vscode.CancellationToken,
            context: vscode.CompletionContext
        }
    ): vscode.CompletionItem[] {
        const escapedTriggerCharacter = escapeRegExp(this.triggerCharacter)
        const reg = new RegExp(escapedTriggerCharacter + '[^\\\\s]*$')
        const result = line.match(reg)
        let suggestions: vscode.CompletionItem[] = []
        if (result) {
            suggestions = this.atSuggestion.provideFrom(result, args)
        }
        return suggestions
    }

}
