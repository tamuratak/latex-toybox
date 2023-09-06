import * as vscode from 'vscode'
import { latexParser } from 'latex-utensils'
import { IContexAwareProvider } from './interface'
import { toLuPos, toVscodePosition } from '../../utils/utensils'
import { ContextAwareKind } from './completionkind'

export class EnvCloser implements IContexAwareProvider {
    readonly needsAst = true

    test(document: vscode.TextDocument, position: vscode.Position, context: vscode.CompletionContext): boolean {
        const textLine = document.lineAt(position)
        if (textLine.isEmptyOrWhitespace) {
            return true
        }
        if (/^\s*\\\s*$/.test(textLine.text) && context.triggerKind === vscode.CompletionTriggerKind.TriggerCharacter) {
            return true
        }
        return false
    }

    provide(_document: vscode.TextDocument, position: vscode.Position, context: vscode.CompletionContext, ast: latexParser.LatexAst | undefined) {
        if (!ast) {
            return []
        }
        const loc = toLuPos(position)
        const findResult = latexParser.findNodeAt(ast.content, loc)
        const node = findResult?.parent?.node
        if (!node || !latexParser.hasContentArray(node)) {
            return []
        }
        const beginEndCommands = node.content.filter(latexParser.isCommand).filter(commnadNode => commnadNode.name === 'begin' || commnadNode.name === 'end')
        if (beginEndCommands.length === 1) {
            const beginEnd = beginEndCommands[0]
            const beginEndPos = toVscodePosition(beginEnd.location.end)
            if (beginEnd.name === 'begin' && beginEndPos.isBefore(position)) {
                const envName = latexParser.stringify(beginEnd.args[0].content)
                const prefix = context.triggerKind === vscode.CompletionTriggerKind.TriggerCharacter ? '' : '\\'
                const item = new vscode.CompletionItem(`${prefix}end{${envName}}`, ContextAwareKind)
                return [item]
            }
        }
        return []
    }

}
