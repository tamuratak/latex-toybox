import * as vscode from 'vscode'
import { latexParser } from 'latex-utensils'
import { findPrevNextNode } from '../../utils/utensils'
import { IContexAwareProvider } from './interface'
import { toLuPos } from '../../utils/utensils'
import { toVscodePosition } from '../../utils/utensils'
import { toVscodeRange } from '../../utils/utensils'
import { sanitizedRemovingItem } from './utils/sanitize'


export class CommandRemover implements IContexAwareProvider {
    readonly needsAst = true

    test(document: vscode.TextDocument, position: vscode.Position): boolean {
        const positionChar = document.getText(
            new vscode.Range(
                position.translate(0, -1),
                position
            )
        )
        const wordRange = document.getWordRangeAtPosition(position, /\\[a-zA-Z]+/)
        if (positionChar === '}' || wordRange) {
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
        if (!findResult) {
            return []
        }
        let commandNode: latexParser.Command
        if (latexParser.hasContentArray(findResult.node)) {
            const prevNext = findPrevNextNode(positionOffset, findResult.node.content)
            const node = prevNext.prev
            if (!node || !node.location || !latexParser.isCommand(node)) {
                return []
            }
            if (!toVscodePosition(node.location.end).isEqual(position)) {
                return []
            }
            commandNode = node
        } else if (latexParser.isCommand(findResult.node)) {
            commandNode = findResult.node
        } else {
            return []
        }
        const edits: vscode.TextEdit[] = []
        const commandStart = toVscodePosition(commandNode.location.start)
        const removeRange = new vscode.Range(commandStart, commandStart.translate(0, commandNode.name.length + 1))
        const item = sanitizedRemovingItem('Remove Command', document, removeRange, position)
        commandNode.args.forEach(arg => {
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
        item.additionalTextEdits?.push(...edits)
        return [item]
    }

}
