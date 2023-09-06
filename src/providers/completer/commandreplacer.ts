import * as vscode from 'vscode'
import { latexParser } from 'latex-utensils'
import { IContexAwareProvider } from './interface'
import { ContextAwareKind } from './completionkind'

export class CommandReplacer implements IContexAwareProvider {
    readonly needsAst = false

    test(document: vscode.TextDocument, position: vscode.Position, context: vscode.CompletionContext): boolean {
        if (context.triggerKind === vscode.CompletionTriggerKind.TriggerCharacter) {
            return false
        }
        const wordRange = document.getWordRangeAtPosition(position, /\\[a-zA-Z]+/)
        if (wordRange) {
            return true
        } else {
            return false
        }
    }

    provide(document: vscode.TextDocument, position: vscode.Position, _context: vscode.CompletionContext, _ast: latexParser.LatexAst | undefined) {
        const commandRange = document.getWordRangeAtPosition(position, /\\[a-zA-Z]+/)
        const command = document.getText(commandRange)
        const textCommands = ['\\emph', '\\textbf', '\\textit', '\\underline', '\\textrm', '\\texttt', '\\textsl', '\\textsc', '\\textnormal', '\\textsuperscript', '\\textsubscript']
        const mathCommands = ['\\mathbf', '\\mathit', '\\mathrm', '\\mathtt', '\\mathsf', '\\mathbb', '\\mathcal']
        if (textCommands.includes(command)) {
            const items = textCommands.map(cmd => {
                const item = new vscode.CompletionItem(cmd, ContextAwareKind)
                item.insertText = cmd
                item.filterText = command
                if (commandRange) {
                    item.range = commandRange
                }
                return item
            })
            return items
        }
        if (mathCommands.includes(command)) {
            const items = mathCommands.map(cmd => {
                const item = new vscode.CompletionItem(cmd, ContextAwareKind)
                item.insertText = cmd
                item.filterText = command
                if (commandRange) {
                    item.range = commandRange
                }
                return item
            })
            return items
        }
        return []
    }

}
