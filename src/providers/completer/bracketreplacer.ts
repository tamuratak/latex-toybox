import * as vscode from 'vscode'
import { latexParser } from 'latex-utensils'
import { toLuPos, toVscodePosition } from '../../utils/utensils'
import { IContexAwareProvider } from './interface'
import { reverseCaseOfFirstCharacterAndConvertToHex } from './utils/sortkey'
import { sanitizedReplacingItem } from './utils/sanitize'


export class BracketReplacer implements IContexAwareProvider {
    readonly needsAst = true

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
        let leftBracketRange: vscode.Range
        let rightBracketRange: vscode.Range
        if (latexParser.isMathDelimiters(node)) {
            const nodeStartPos = toVscodePosition(node.location.start)
            const nodeEndPos = toVscodePosition(node.location.end)
            leftBracketRange = new vscode.Range(
                nodeStartPos,
                nodeStartPos.translate(0, node.lcommand.length + node.left.length)
            )
            rightBracketRange = new vscode.Range(
                nodeEndPos.translate(0, - node.rcommand.length - node.right.length),
                nodeEndPos
            )
        } else if (latexParser.isMatchingDelimiters(node)) {
            const nodeStartPos = toVscodePosition(node.location.start)
            const nodeEndPos = toVscodePosition(node.location.end)
            leftBracketRange = new vscode.Range(
                nodeStartPos,
                nodeStartPos.translate(0, '\\left'.length + node.left.length)
            )
            rightBracketRange = new vscode.Range(
                nodeEndPos.translate(0, - '\\right'.length - node.right.length),
                nodeEndPos
            )
        } else {
            return []
        }
        const suggestions: vscode.CompletionItem[] = []
        for (const [sortkey, pairs] of this.bracketPairs) {
            for (const [left, right] of pairs) {
                const sortText = sortkey + reverseCaseOfFirstCharacterAndConvertToHex(left)
                // Workaround for https://github.com/microsoft/vscode/issues/176154
                const item = sanitizedReplacingItem(left, document, leftBracketRange, left, position)
                const redit = vscode.TextEdit.replace(rightBracketRange, right)
                item.sortText = sortText
                item.additionalTextEdits?.push(redit)
                suggestions.push(item)
            }
        }

        return suggestions
    }

}
