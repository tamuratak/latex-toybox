import * as vscode from 'vscode'
import { latexParser } from 'latex-utensils'
import { IContexAwareProvider } from './interface'
import { findNodeContactedWithPosition, toVscodePosition } from '../../utils/utensils'
import { Command } from './command'
import { ContextAwareKind } from './completionkind'

export class CommandAdder implements IContexAwareProvider {
    readonly needsAst = true
    private readonly command: Command

    constructor(command: Command) {
        this.command = command
    }

    test(document: vscode.TextDocument, position: vscode.Position, context: vscode.CompletionContext): boolean {
        if (context.triggerKind === vscode.CompletionTriggerKind.TriggerCharacter) {
            return false
        }
        const wordRange = document.getWordRangeAtPosition(position, /[{}]/)
        if (wordRange) {
            return true
        } else {
            return false
        }
    }

    provide(document: vscode.TextDocument, position: vscode.Position, _context: vscode.CompletionContext, ast: latexParser.LatexAst | undefined) {
        if (!ast) {
            return []
        }
        const node = findNodeContactedWithPosition(document, position, ast)
        if (!node || !latexParser.isGroup(node)) {
            return []
        }
        const cmdItems = this.command.provide(document.languageId)
        const insertPos = toVscodePosition(node.location.start)
        const memo = new Set<string>()
        const items: vscode.CompletionItem[] = []
        for (const cmdItem of cmdItems) {
            const item = new vscode.CompletionItem(cmdItem.label, ContextAwareKind)
            item.insertText = ''
            const match = /^(\\[a-zA-Z]+)\{/.exec(cmdItem.label)
            if (!match) {
                continue
            }
            if (memo.has(match[1])) {
                continue
            }
            memo.add(match[1])
            const edit = vscode.TextEdit.insert(insertPos, match[1])
            item.additionalTextEdits = [edit]
            items.push(item)
        }
        return items
    }

}
