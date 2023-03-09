import * as vscode from 'vscode'
import { latexParser } from 'latex-utensils'
import { findPrevNextNode } from '../../utils/utensils'
import { IContexAwareProvider } from './interface'
import { toLuPos } from '../../utils/utensils'
import { toVscodePosition } from '../../utils/utensils'
import { toVscodeRange } from '../../utils/utensils'


export class CommandRemover implements IContexAwareProvider {
    readonly needsAst = true

    test(document: vscode.TextDocument, position: vscode.Position): boolean {
        const line = document.lineAt(position.line).text.substring(0, position.character)
        if (/[}]$/.exec(line)) {
            return true
        } else {
            return false
        }
    }

    provide(document: vscode.TextDocument, position: vscode.Position, _context: vscode.CompletionContext, ast: latexParser.LatexAst | undefined) {
        if (!ast) {
            return []
        }
        const positionOffset = document.offsetAt(position)
        const luPos = toLuPos(position)
        const findResult = latexParser.findNodeAt(ast.content, luPos)
        if (!findResult || !latexParser.hasContentArray(findResult.node)) {
            return []
        }
        const prevNext = findPrevNextNode(positionOffset, findResult.node.content)
        const node = prevNext.prev
        if (!node || !node.location || !latexParser.isCommand(node)) {
            return []
        }
        if (!toVscodePosition(node.location.end).isEqual(position)) {
            return []
        }
        const edits: vscode.TextEdit[] = []
        const commandStart = toVscodePosition(node.location.start)
        const removeCommand = vscode.TextEdit.delete(new vscode.Range(commandStart, commandStart.translate(0, node.name.length + 1)))
        edits.push(removeCommand)
        node.args.forEach(arg => {
            if (latexParser.isOptionalArg(arg)) {
                edits.push(vscode.TextEdit.delete(toVscodeRange(arg.location)))
            } else {
                const startPos = toVscodePosition(arg.location.start)
                const startEdit = vscode.TextEdit.replace(new vscode.Range(startPos, startPos.translate(0,1)), ' ')
                edits.push(startEdit)
                const endPos = toVscodePosition(arg.location.end)
                const endEdit = vscode.TextEdit.replace(new vscode.Range(endPos.translate(0,-1), endPos), ' ')
                edits.push(endEdit)
            }
        })
        const item = new vscode.CompletionItem('Remove command', vscode.CompletionItemKind.Issue)
        item.insertText = ''
        item.additionalTextEdits = edits
        return [item]
    }

}
