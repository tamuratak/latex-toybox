import * as vscode from 'vscode'
import { latexParser } from 'latex-utensils'
import { IContexAwareProvider } from './interface'
import { findPrevNextNode, toLuPos, toVscodePosition } from '../../utils/utensils'
import { Command } from './command'

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
        const pos = toLuPos(position)
        const findResult = latexParser.findNodeAt(ast.content, pos)
        if (!findResult || !findResult.node.location) {
            return []
        }
        const node = findResult.node
        const positionOffset = document.offsetAt(position)
        if (!latexParser.hasContentArray(node)) {
            return []
        }
        const prevNext = findPrevNextNode(positionOffset, node.content)
        const {prev, next} = prevNext
        const cmdItems = this.command.provide(document.languageId)
        let insertPos: vscode.Position | undefined
        if (prev && latexParser.isGroup(prev)) {
            const prevEnd = toVscodePosition(prev.location.end)
            const prevStart = toVscodePosition(prev.location.start)
            if (prevEnd.isEqual(position)) {
                insertPos = prevStart
            }
        }
        if (next && latexParser.isGroup(next)) {
            const nextStart = toVscodePosition(next.location.start)
            if (nextStart.isEqual(position)) {
                insertPos = nextStart
            }
        }
        if (!insertPos) {
            return []
        }
        const memo = new Set<string>()
        const items: vscode.CompletionItem[] = []
        for (const cmdItem of cmdItems) {
            const item = new vscode.CompletionItem(cmdItem.label, vscode.CompletionItemKind.Issue)
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
