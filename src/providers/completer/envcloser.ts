import * as vscode from 'vscode'
import { latexParser } from 'latex-utensils'
import { IContexAwareProvider } from './interface'
import { toLuPos } from '../../utils/utensils'

export class EnvCloser implements IContexAwareProvider {
    readonly needsAst = true

    test(document: vscode.TextDocument, position: vscode.Position, context: vscode.CompletionContext): boolean {
        const line = document.lineAt(position.line).text.substring(0, position.character)
        if (/^\s*$/.test(line) || vscode.CompletionTriggerKind.TriggerCharacter === context.triggerKind) {
            return true
        } else {
            return false
        }
    }

    provide(_document: vscode.TextDocument, position: vscode.Position, context: vscode.CompletionContext, ast: latexParser.LatexAst | undefined): vscode.CompletionItem[] {
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
            if (beginEnd.name === 'begin') {
                const envName = latexParser.stringify(beginEnd.args[0].content)
                const prefix = vscode.CompletionTriggerKind.TriggerCharacter === context.triggerKind ? '' : '\\'
                const item = new vscode.CompletionItem(`${prefix}end{${envName}}`, vscode.CompletionItemKind.Issue)
                return [item]
            }
        }
        return []
    }

}
