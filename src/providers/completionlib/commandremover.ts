import * as vscode from 'vscode'
import { latexParser } from 'latex-utensils'
import { findNodeContactedWithPosition, toLuPos } from '../../utils/utensils.js'
import { IContexAwareProvider } from './interface.js'
import { toVscodePosition } from '../../utils/utensils.js'
import { toVscodeRange } from '../../utils/utensils.js'
import { isPositionAtClosingBrace } from './utils/position.js'
import { ContextAwareKind } from './completionkind.js'


export class CommandRemover implements IContexAwareProvider {
    readonly needsAst = true

    test(document: vscode.TextDocument, position: vscode.Position, context: vscode.CompletionContext): boolean {
        if (context.triggerKind === vscode.CompletionTriggerKind.TriggerCharacter) {
            return false
        }
        if (isPositionAtClosingBrace(document, position)) {
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
        const item = new vscode.CompletionItem('Remove Command', ContextAwareKind)
        item.insertText = ''
        item.filterText = document.getText(removeRange)
        const edit = vscode.TextEdit.delete(removeRange)
        item.additionalTextEdits = [edit]
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
        item.additionalTextEdits.push(...edits)
        return [item]
    }

}
