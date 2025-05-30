import * as vscode from 'vscode'
import { latexParser } from 'latex-utensils'
import { findNodeContactedWithPosition, toLuPos, toVscodePosition } from '../../utils/utensils.js'
import { IContexAwareProvider } from './interface.js'
import { reverseCaseOfFirstCharacterAndConvertToHex } from './utils/sortkey.js'
import { getPrevChar } from './utils/position.js'
import { ContextAwareKind } from './completionkind.js'
import type { MathPreview } from '../../components/mathpreview.js'
import { ExternalPromise } from '../../utils/externalpromise.js'
import { Logger } from '../../components/logger.js'


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

    private readonly bracketDocumentMapPromise = new ExternalPromise<Map<string, vscode.MarkdownString>>()

    constructor(private readonly extension: {
        readonly logger: Logger,
        readonly mathPreview: MathPreview
    }) {
        setTimeout(() => this.initializeBracketDocumentMap(), 0)
    }

    async initializeBracketDocumentMap() {
        const bracketDocumentMap = new Map<string, vscode.MarkdownString>()
        for (const [key, pairs] of this.bracketPairs) {
            // Skip the last group of brackets because they are not supported by MathJax.
            if (key === '04') {
                continue
            }
            for (const [left, right] of pairs) {
                try {
                    const {svgDataUrl} = await this.extension.mathPreview.generateSVG({
                        texString: `\\begin{align*}${left}x${right} + ${left} \\sum a_i ${right}\\end{align*}`,
                        envname: 'align*'
                    }, '')
                    bracketDocumentMap.set(left, new vscode.MarkdownString(`![${left}${right}](${svgDataUrl})`))
                } catch {
                    this.extension.logger.debug(`Failed to generate preview for ${left}${right}`)
                }
            }
        }
        this.bracketDocumentMapPromise.resolve(bracketDocumentMap)
    }

    test(document: vscode.TextDocument, position: vscode.Position, context: vscode.CompletionContext): boolean {
        if (context.triggerKind === vscode.CompletionTriggerKind.TriggerCharacter) {
            return false
        }
        const currentChar = document.getText(new vscode.Range(position, position.translate(0, 1)))
        if (/[\\({[]/.test(currentChar)) {
            return true
        }
        const prevChar = getPrevChar(document, position)
        if (prevChar && /[{}[\]()]/.test(prevChar)) {
            return true
        }
        return false
    }

    async provide(document: vscode.TextDocument, position: vscode.Position, _context: vscode.CompletionContext, ast: latexParser.LatexAst | undefined) {
        if (!ast) {
            return []
        }
        const node = this.findBracketPair(document, position, ast)
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
        const isPosAtBracket = [leftBracketRange.start, leftBracketRange.end, rightBracketRange.start, rightBracketRange.end].some(braPos => braPos.isEqual(position))
        if (!isPosAtBracket) {
            return []
        }
        const suggestions: vscode.CompletionItem[] = []
        for (const [sortkey, pairs] of this.bracketPairs) {
            for (const [left, right] of pairs) {
                const sortText = sortkey + reverseCaseOfFirstCharacterAndConvertToHex(left)
                const item = new vscode.CompletionItem(left, ContextAwareKind)
                item.insertText = ''
                const ledit = vscode.TextEdit.replace(leftBracketRange, left)
                const redit = vscode.TextEdit.replace(rightBracketRange, right)
                item.sortText = sortText
                item.filterText = document.getText(leftBracketRange)
                item.additionalTextEdits = [ledit, redit]
                const bracketDocumentMap = await this.bracketDocumentMapPromise.promise
                const md = bracketDocumentMap.get(left)
                if (md) {
                    item.documentation = md
                }
                suggestions.push(item)
            }
        }

        return suggestions
    }

    findBracketPair(document: vscode.TextDocument, position: vscode.Position, ast: latexParser.LatexAst) {
        let node = findNodeContactedWithPosition(document, position, ast)
        if (latexParser.isMatchingDelimiters(node) || latexParser.isMathDelimiters(node)) {
            return node
        }
        const loc = toLuPos(position)
        const findResult = latexParser.findNodeAt(ast.content, loc)
        node = findResult?.node
        if (latexParser.isMatchingDelimiters(node) || latexParser.isMathDelimiters(node)) {
            return node
        }
        return
    }

}
