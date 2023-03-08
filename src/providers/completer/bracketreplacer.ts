import * as vscode from 'vscode'
import { latexParser } from 'latex-utensils'
import { toLuPos, toVscodePosition } from '../../utils/utensils'
import { IContexAwareProvider, ILwCompletionItem } from './interface'
import { reverseCaseOfFirstCharacterAndConvertToHex } from './utils/sortkey'
import { sanitizeReplace } from './utils/sanitize'


export class BracketReplacer implements IContexAwareProvider {
    private readonly bracketPairs = new Map<string, [string, string][]>(
        [
            ['01', [
                ['\\{', '\\}'],
                ['[', ']'],
                ['(', ')'],
                ['\\left(', '\\right)'],
                ['\\left[', '\\right]'],
                ['\\left\\{', '\\right\\}']
            ]],
            ['02', [
                ['\\left<', '\\right>'],
                ['\\bigl(', '\\bigr)'],
                ['\\bigl[', '\\bigr]'],
                ['\\bigl\\{', '\\bigr\\}'],
                ['\\Bigl(', '\\Bigr)'],
                ['\\Bigl[', '\\Bigr]'],
                ['\\Bigl\\{', '\\Bigr\\}'],
                ['\\biggl(', '\\biggr)'],
                ['\\biggl[', '\\biggr]'],
                ['\\biggl\\{', '\\biggr\\}'],
                ['\\Biggl(', '\\Biggr)'],
                ['\\Biggl[', '\\Biggr]'],
                ['\\Biggl\\{', '\\Biggr\\}'],
            ]],
            ['03', [
                ['\\left|', '\\right|'],
                ['\\bigl|', '\\bigr|'],
                ['\\Bigl|', '\\Bigr|'],
                ['\\biggl|', '\\biggr|'],
                ['\\Biggl|', '\\Biggr|'],
                ['\\left\\|', '\\right\\|'],
                ['\\biggl\\|', '\\biggr\\|'],
                ['\\Biggl\\|', '\\Biggr\\|'],
                ['\\Bigl\\|', '\\Bigr\\|'],
                ['\\bigl\\|', '\\bigr\\|'],
            ]],
            ['04', [
                ['\\langle', '\\rangle'],
                ['\\lvert', '\\rvert'],
                ['\\lVert', '\\rVert'],
                ['\\left\\vert', '\\right\\vert'],
                ['\\left\\Vert', '\\right\\Vert'],
                ['\\left\\langle', '\\right\\rangle'],
                ['\\left\\lvert', '\\right\\rvert'],
                ['\\left\\lVert', '\\right\\rVert'],
                ['\\bigl\\langle', '\\bigr\\rangle'],
                ['\\bigl\\vert', '\\bigr\\vert'],
                ['\\bigl\\lvert', '\\bigr\\rvert'],
                ['\\bigl\\lVert', '\\bigr\\rVert'],
                ['\\bigl\\Vert', '\\bigr\\Vert'],
                ['\\Bigl\\langle', '\\Bigr\\rangle'],
                ['\\Bigl\\lvert', '\\Bigr\\rvert'],
                ['\\Bigl\\vert', '\\Bigr\\vert'],
                ['\\Bigl\\lVert', '\\Bigr\\rVert'],
                ['\\Bigl\\Vert', '\\Bigr\\Vert'],
                ['\\biggl\\langle', '\\biggr\\rangle'],
                ['\\biggl\\lvert', '\\biggr\\rvert'],
                ['\\biggl\\vert', '\\biggr\\vert'],
                ['\\biggl\\lVert', '\\biggr\\rVert'],
                ['\\biggl\\Vert', '\\biggr\\Vert'],
                ['\\Biggl\\langle', '\\Biggr\\rangle'],
                ['\\Biggl\\lvert', '\\Biggr\\rvert'],
                ['\\Biggl\\vert', '\\Biggr\\vert'],
                ['\\Biggl\\lVert', '\\Biggr\\rVert'],
                ['\\Biggl\\Vert', '\\Biggr\\Vert']
            ]]
        ]
    )

    test(document: vscode.TextDocument, position: vscode.Position): boolean {
        const line = document.lineAt(position.line).text.substring(0, position.character)
        if (/[({[]$/.exec(line)) {
            return true
        } else {
            return false
        }
    }

    provide(_document: vscode.TextDocument, position: vscode.Position, _context: vscode.CompletionContext, ast: latexParser.LatexAst | undefined): ILwCompletionItem[] {
        if (!ast) {
            return []
        }
        const loc = toLuPos(position)
        const findResult = latexParser.findNodeAt(ast.content, loc)
        if (!findResult || !findResult.node.location) {
            return []
        }
        const node = findResult.node
        if (!latexParser.isMathDelimiters(node)) {
            return []
        }
        const leftBracketRange = new vscode.Range(
            toVscodePosition(node.location.start),
            toVscodePosition({line: node.location.start.line, column: node.location.start.column + node.lcommand.length + node.left.length })
        )
        const rightBracketRange = new vscode.Range(
            toVscodePosition({line: node.location.end.line, column: node.location.end.column - node.rcommand.length - node.right.length }),
            toVscodePosition(node.location.end),
        )

        const suggestions: ILwCompletionItem[] = []
        for (const [sortkey, pairs] of this.bracketPairs) {
            for (const [left, right] of pairs) {
                const sortText = sortkey + reverseCaseOfFirstCharacterAndConvertToHex(left)
                // Workaround for https://github.com/microsoft/vscode/issues/176154
                const { leditRange, leditString, insertText } = sanitizeReplace(leftBracketRange, left, position)
                const ledit = vscode.TextEdit.replace(leditRange, leditString)
                const redit = vscode.TextEdit.replace(rightBracketRange, right)
                const item: ILwCompletionItem = {
                    label: left,
                    insertText,
                    sortText,
                    kind: vscode.CompletionItemKind.Issue,
                    additionalTextEdits: [ledit, redit]
                }
                suggestions.push(item)
            }
        }

        return suggestions
    }

}
