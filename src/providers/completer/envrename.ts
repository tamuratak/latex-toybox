import * as vscode from 'vscode'
import { latexParser } from 'latex-utensils'
import { IContexAwareProvider } from './interface'
import { Environment } from './environment'
import { toLuPos, toVscodePosition } from '../../utils/utensils'
import { sanitizedReplacingItemFilterable } from './utils/sanitize'

export class EnvRename implements IContexAwareProvider {
    readonly needsAst = true
    private readonly environment: Environment

    constructor(environment: Environment) {
        this.environment = environment
    }

    test(document: vscode.TextDocument, position: vscode.Position): boolean {
        if (document.languageId !== 'latex') {
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
            const item = sanitizedReplacingItemFilterable(env.label, document, beginNameRange, env.label + '}', position)
            item.additionalTextEdits?.push(vscode.TextEdit.replace(endNameRange, env.label))
            items.push(item)
        }
        return items
    }

}
