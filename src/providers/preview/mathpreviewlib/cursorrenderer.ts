import { latexParser } from 'latex-utensils'
import * as vscode from 'vscode'
import { TexMathEnv } from './texmathenvfinder'

import type { UtensilsParserLocator } from '../../../interfaces'
import type { ITextDocumentLike } from './textdocumentlike'
import { convertPositionToOffset, toLuPos } from '../../../utils/utensils'

type PrevNextNodes = {
    readonly prev: latexParser.Node | undefined,
    readonly next: latexParser.Node | undefined
}

interface IExtension extends UtensilsParserLocator { }

export class CursorRenderer {
    private readonly extension: IExtension
    private currentTeXString: string | undefined
    private currentAst: latexParser.LatexAst | undefined

    constructor(extension: IExtension) {
        this.extension = extension
    }

    // Test whether cursor is in tex command strings
    // like \begin{...} \end{...} \xxxx{ \[ \] \( \) or \\
    isCursorInTeXCommand(document: ITextDocumentLike): boolean {
        const editor = vscode.window.activeTextEditor
        if (!editor) {
            return false
        }
        const cursor = editor.selection.active
        const r = document.getWordRangeAtPosition(cursor, /\\(?:begin|end|label)\{.*?\}|\\[a-zA-Z]+\{?|\\[()[\]]|\\\\/)
        if (r && r.start.isBefore(cursor) && r.end.isAfter(cursor) ) {
            return true
        }
        return false
    }

    cursorPosInSnippet(texMath: TexMathEnv, cursorPos: vscode.Position): vscode.Position {
        const line = cursorPos.line - texMath.range.start.line
        const character = line === 0 ? cursorPos.character - texMath.range.start.character : cursorPos.character
        return new vscode.Position(line, character)
    }

    isInAmsMathTextCommand(findResult: latexParser.FindResult<latexParser.Node> | undefined): boolean {
        let parent = findResult?.parent
        while (parent) {
            if (latexParser.isAmsMathTextCommand(parent.node)) {
                return true
            }
            parent = parent.parent
        }
        return false
    }

    async insertCursor(texMath: TexMathEnv, originalCursorPos: vscode.Position, cursor: string): Promise<string | undefined> {
        const cursorPos = this.cursorPosInSnippet(texMath, originalCursorPos)
        const findResult = await this.findNodeAt(texMath, cursorPos)
        if (!findResult) {
            return
        }
        const cursorNode = findResult.node
        if (this.isInAmsMathTextCommand(findResult)) {
            return
        }
        if (cursorNode && latexParser.isCommand(cursorNode)) {
            return
        }
        let nodeStart: number | undefined
        let nodeEnd: number | undefined
        const texString = texMath.texString
        const cursorOffset = convertPositionToOffset(cursorPos, texString)
        if (latexParser.hasContentArray(findResult.node)) {
            const {prev} = this.findPrevNextNode(cursorOffset, findResult.node.content)
            if (latexParser.isSubscript(prev) || latexParser.isSuperscript(prev)) {
                const arg = prev.arg
                if (latexParser.isMathCharacter(arg) && arg.location?.end.offset === cursorOffset) {
                    nodeStart = arg.location?.start.offset
                    nodeEnd = arg.location?.end.offset
                }
            }
        }
        if (latexParser.isSuperscript(cursorNode) || latexParser.isSubscript(cursorNode)) {
            const arg = cursorNode.arg
            if (arg && latexParser.isMathCharacter(arg)) {
                nodeStart = arg.location?.start.offset
                nodeEnd = arg.location?.end.offset
            } else {
                return
            }
        }
        if (nodeStart !== undefined && nodeEnd !== undefined) {
            const newTexString = texString.substring(0, nodeStart)
                + '{~'
                + texString.substring(nodeStart, cursorOffset)
                + cursor
                + texString.substring(cursorOffset, nodeEnd)
                + '~}'
                + texString.substring(nodeEnd)
            return newTexString
        } else {
            const newTexString = texString.substring(0, cursorOffset)
                + '{~'
                + cursor
                + '~}'
                + texString.substring(cursorOffset)
            return newTexString
        }
    }

    async findNodeAt(texMath: TexMathEnv, cursorPosInSnippet: vscode.Position) {
        let ast: latexParser.LatexAst | undefined
        if (texMath.texString === this.currentTeXString && this.currentAst) {
            ast = this.currentAst
        } else {
            ast = await this.extension.pegParser.parseLatex(texMath.texString, {enableMathCharacterLocation: true})
            this.currentAst = ast
            this.currentTeXString = texMath.texString
        }
        if (!ast) {
            return
        }
        const cursorLuPosInSnippet = toLuPos(cursorPosInSnippet)
        const result = latexParser.findNodeAt(ast.content, cursorLuPosInSnippet)
        return result
    }

    findPrevNextNode(cursorOffset: number, nodeArray: latexParser.Node[]): PrevNextNodes {
        let prev: latexParser.Node | undefined
        for (let i = 0; i < nodeArray.length; i++) {
            const node = nodeArray[i]
            const loc = node.location
            if (loc && cursorOffset <= loc.start.offset) {
                return { prev, next: node }
            } else {
                prev = node
            }
        }
        return { prev, next: undefined }
    }

    async renderCursor(
        document: ITextDocumentLike,
        texMath: TexMathEnv,
        thisColor: string,
        cursorPos?: vscode.Position
    ): Promise<string | undefined> {
        const configuration = vscode.workspace.getConfiguration('latex-workshop')
        const cursorEnabled = configuration.get('hover.preview.cursor.enabled') as boolean
        if (!cursorEnabled) {
            return
        }
        const texMathRange = texMath.range
        cursorPos ??= vscode.window.activeTextEditor?.selection.active
        if (!cursorPos) {
            return
        }
        if (!this.isCursorInsideTexMath(texMathRange, cursorPos)) {
            return
        }
        if (this.isCursorInTeXCommand(document)) {
            return
        }
        const symbol = configuration.get('hover.preview.cursor.symbol') as string
        const color = configuration.get('hover.preview.cursor.color') as string
        const cursorString = color === 'auto' ? `{\\color{${thisColor}}${symbol}}` : `{\\color{${color}}${symbol}}`
        const ret = await this.insertCursor(texMath, cursorPos, cursorString)
        return ret
    }

    isCursorInsideTexMath(texMathRange: vscode.Range, cursorPos: vscode.Position): boolean {
        return texMathRange.contains(cursorPos) && !texMathRange.start.isEqual(cursorPos) && !texMathRange.end.isEqual(cursorPos)
    }

}
