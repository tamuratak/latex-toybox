import { latexParser } from 'latex-utensils'
import * as vscode from 'vscode'
import { TexMathEnv } from './texmathenvfinder.js'

import type { ITextDocumentLike } from './textdocumentlike.js'
import { convertPositionToOffset, findPrevNextNode, isSubOrSuper, toLuPos } from '../../utils/utensils.js'
import type { UtensilsParser } from '../utensilsparser.js'


// Test whether cursor is in tex command strings
// like \begin{...} \end{...} \xxxx{ \[ \] \( \) or \\
function isCursorInTeXCommand(document: ITextDocumentLike): boolean {
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

function getCursorPosInSnippet(texMath: TexMathEnv, cursorPos: vscode.Position): vscode.Position {
    const line = cursorPos.line - texMath.range.start.line
    const character = line === 0 ? cursorPos.character - texMath.range.start.character : cursorPos.character
    return new vscode.Position(line, character)
}

function isInNonMathCommand(findResult: latexParser.FindResult<latexParser.Node> | undefined): boolean {
    let parent = findResult?.parent
    while (parent) {
        const node = parent.node
        if (
            latexParser.isAmsMathTextCommand(parent.node) ||
            latexParser.isCommand(node) && node.name === 'tag'
        ) {
            return true
        }
        parent = parent.parent
    }
    return false
}

export function isCursorInsideTexMath(texMathRange: vscode.Range, cursorPos: vscode.Position): boolean {
    return texMathRange.contains(cursorPos) && !texMathRange.start.isEqual(cursorPos) && !texMathRange.end.isEqual(cursorPos)
}

export class CursorRenderer {
    private currentTeXString: string | undefined
    private currentAst: latexParser.LatexAst | undefined

    constructor(private readonly extension: {
        readonly utensilsParser: UtensilsParser
    }) { }

    async insertCursor(texMath: TexMathEnv, originalCursorPos: vscode.Position, cursor: string): Promise<string | undefined> {
        const cursorPos = getCursorPosInSnippet(texMath, originalCursorPos)
        const findResult = await this.findNodeAt(texMath, cursorPos)
        if (!findResult) {
            return
        }
        const cursorNode = findResult.node
        if (isInNonMathCommand(findResult)) {
            return
        }
        if (cursorNode && latexParser.isCommand(cursorNode)) {
            return
        }
        let newCursorNodeLoc: {
            start: { offset: number },
            end: { offset: number }
        } | undefined
        const texString = texMath.texString
        const cursorOffset = convertPositionToOffset(cursorPos, texString)
        if (latexParser.hasContentArray(cursorNode)) {
            const {prev, next} = findPrevNextNode(cursorOffset, cursorNode.content)
            if (isSubOrSuper(prev)) {
                const arg = prev.arg
                if (latexParser.isGroup(arg) && isSubOrSuper(next)) {
                    return
                } else if (latexParser.isMathCharacter(arg) && arg.location?.end.offset === cursorOffset) {
                    newCursorNodeLoc = arg.location
                }
            } else if (isSubOrSuper(next)) {
                newCursorNodeLoc = prev?.location
            }
        } else if (isSubOrSuper(cursorNode)) {
            const arg = cursorNode.arg
            if (arg && latexParser.isMathCharacter(arg)) {
                newCursorNodeLoc = arg.location
            } else {
                return
            }
        }
        if (newCursorNodeLoc) {
            const nodeStart = newCursorNodeLoc.start.offset
            const nodeEnd = newCursorNodeLoc.end.offset
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

    private async findNodeAt(texMath: TexMathEnv, cursorPosInSnippet: vscode.Position) {
        let ast: latexParser.LatexAst | undefined
        if (texMath.texString === this.currentTeXString && this.currentAst) {
            ast = this.currentAst
        } else {
            ast = await this.extension.utensilsParser.parseLatex(texMath.texString, {enableMathCharacterLocation: true})
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

    async renderCursor(
        document: ITextDocumentLike,
        texMath: TexMathEnv,
        thisColor: string,
        cursorPos?: vscode.Position
    ): Promise<string | undefined> {
        const configuration = vscode.workspace.getConfiguration('latex-toybox')
        const cursorEnabled = configuration.get('hover.preview.cursor.enabled') as boolean
        if (!cursorEnabled) {
            return
        }
        const texMathRange = texMath.range
        cursorPos ??= vscode.window.activeTextEditor?.selection.active
        if (!cursorPos) {
            return
        }
        if (!isCursorInsideTexMath(texMathRange, cursorPos)) {
            return
        }
        if (isCursorInTeXCommand(document)) {
            return
        }
        const symbol = configuration.get('hover.preview.cursor.symbol') as string
        const color = configuration.get('hover.preview.cursor.color') as string
        const cursorString = color === 'auto' ? `{\\color{${thisColor}}${symbol}}` : `{\\color{${color}}${symbol}}`
        const ret = await this.insertCursor(texMath, cursorPos, cursorString)
        return ret
    }

}
