import * as vscode from 'vscode'
import { latexParser } from 'latex-utensils'
import { findNodeContactedWithPosition, toLuPos } from '../../utils/utensils'
import { IContexAwareProvider } from './interface'
import { toVscodePosition } from '../../utils/utensils'
import { toVscodeRange } from '../../utils/utensils'
import { sanitizedRemovingItem } from './utils/sanitize'
import { isPositionAtTerminator } from './utils/position'


export class CommandRemover implements IContexAwareProvider {
    readonly needsAst = true

    test(document: vscode.TextDocument, position: vscode.Position, context: vscode.CompletionContext): boolean {
        if (context.triggerKind === vscode.CompletionTriggerKind.TriggerCharacter) {
            return false
        }
        const wordRange = document.getWordRangeAtPosition(position, /\\[a-zA-Z]+\{/)
        if (wordRange || isPositionAtTerminator(document, position)) {
            return true
        } else {
            return false
        }
    }

    provide(document: vscode.TextDocument, position: vscode.Position, _context: vscode.CompletionContext, ast: latexParser.LatexAst | undefined) {
        if (!ast) {
            return []
        }
        const luPos = toLuPos(position)
        const findResultNode = latexParser.findNodeAt(ast.content, luPos)?.node
        let commandNode: latexParser.Node | undefined
        if (latexParser.isCommand(findResultNode)) {
            commandNode = findResultNode
        } else {
            commandNode = findNodeContactedWithPosition(document, position, ast)
        }
        if (!commandNode?.location || !latexParser.isCommand(commandNode)) {
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
