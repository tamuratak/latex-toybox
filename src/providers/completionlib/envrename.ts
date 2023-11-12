import * as vscode from 'vscode'
import { latexParser } from 'latex-utensils'
import { IContexAwareProvider } from './interface.js'
import { Environment } from './environment.js'
import { toLuPos, toVscodePosition } from '../../utils/utensils.js'
import { ContextAwareKind } from './completionkind.js'


export class EnvRename implements IContexAwareProvider {
    readonly needsAst = true
    private readonly environment: Environment

    constructor(environment: Environment) {
        this.environment = environment
    }

    test(document: vscode.TextDocument, position: vscode.Position, context: vscode.CompletionContext): boolean {
        if (context.triggerKind === vscode.CompletionTriggerKind.TriggerCharacter) {
            return false
        }
        const wordRange = document.getWordRangeAtPosition(position, /\\begin\{[^}]*\}/)
        if (wordRange && wordRange.end.isEqual(position)) {
            return true
        } else {
            return false
        }
    }

    provide(document: vscode.TextDocument, position: vscode.Position, _context: vscode.CompletionContext, ast: latexParser.LatexAst | undefined) {
        if (!ast) {
            return []
        }
        const loc = toLuPos(position)
        const findResult = latexParser.findNodeAt(ast.content, loc)
        if (!findResult || !findResult.node.location) {
            return []
        }
        const node = findResult.node
        if (!latexParser.isEnvironment(node) && !latexParser.isMathEnv(node) && !latexParser.isMathEnvAligned(node) && !latexParser.isVerbatim(node)) {
            return []
        }
        if (node.location.start.line !== loc.line) {
            return []
        }
        const startPos = toVscodePosition(node.location.start)
        const beginNameRange = new vscode.Range(
            startPos.translate(0, '\\begin{'.length),
            startPos.translate(0, '\\begin{'.length + node.name.length + '}'.length)
        )
        const endPos = toVscodePosition(node.location.end)
        const endNameRange = new vscode.Range(
            endPos.translate(0, -('}'.length + node.name.length)),
            endPos.translate(0, -'}'.length)
        )
        const envs = this.environment.provideFrom(undefined, {document, position})
        const items: vscode.CompletionItem[] = []
        for (const env of envs) {
            if (typeof env.label !== 'string') {
                continue
            }
            if (/[{[]/.test(env.label)) {
                continue
            }
            const item = new vscode.CompletionItem(env.label, ContextAwareKind)
            item.insertText = ''
            const ledit = vscode.TextEdit.replace(beginNameRange, env.label + '}')
            const redit = vscode.TextEdit.replace(endNameRange, env.label)
            item.additionalTextEdits = [ledit, redit]
            items.push(item)
        }
        return items
    }

}
