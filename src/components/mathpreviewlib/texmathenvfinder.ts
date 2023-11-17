import * as vscode from 'vscode'

import * as utils from '../../utils/utils.js'
import { type ITextDocumentLike, TextDocumentLike } from './textdocumentlike.js'
import type { LabelDefinitionEntry } from '../../providers/completionlib/labeldefinition.js'
import { stripCommentsAndVerbatim } from '../../utils/strip.js'

export type TexMathEnv = {
    readonly texString: string,
    readonly envname: string,
    readonly range: vscode.Range
}

export class TeXMathEnvFinder {

    findHoverOnTex(document: ITextDocumentLike, position: vscode.Position): TexMathEnv | undefined {
        const envBeginPat = /\\begin\{(align|align\*|alignat|alignat\*|aligned|alignedat|array|Bmatrix|bmatrix|cases|CD|eqnarray|eqnarray\*|equation|equation\*|gather|gather\*|gathered|matrix|multline|multline\*|pmatrix|smallmatrix|split|subarray|Vmatrix|vmatrix)\}/
        let r = document.getWordRangeAtPosition(position, envBeginPat)
        if (r) {
            const envname = this.getFirstRememberedSubstring(document.getText(r), envBeginPat)
            return this.findHoverOnEnv(document, envname, r.start)
        }
        const parenBeginPat = /(\\\[|\\\(|\$\$)/
        r = document.getWordRangeAtPosition(position, parenBeginPat)
        if (r) {
            const paren = this.getFirstRememberedSubstring(document.getText(r), parenBeginPat)
            return this.findHoverOnParen(document, paren, r.start)
        }
        return this.findHoverOnInline(document, position)
    }

    async findHoverOnRef(
        document: ITextDocumentLike,
        position: vscode.Position,
        labelDef: LabelDefinitionEntry,
        token: string,
    ): Promise<TexMathEnv | undefined> {
        const limit = vscode.workspace.getConfiguration('latex-toybox').get('hover.preview.maxLines') as number
        const docOfRef = await TextDocumentLike.load(labelDef.file)
        const envBeginPatMathMode = /\\begin\{(align|align\*|alignat|alignat\*|eqnarray|eqnarray\*|equation|equation\*|gather|gather\*)\}/
        const l = docOfRef.lineAt(labelDef.position.line).text
        const pat = new RegExp('\\\\label\\{' + utils.escapeRegExp(token) + '\\}')
        const m = l.match(pat)
        if (m && m.index !== undefined) {
            const labelPos = new vscode.Position(labelDef.position.line, m.index)
            const beginPos = this.findBeginPair(docOfRef, envBeginPatMathMode, labelPos, limit)
            if (beginPos) {
                const t = this.findHoverOnTex(docOfRef, beginPos)
                if (t) {
                    const beginEndRange = t.range
                    const refRange = document.getWordRangeAtPosition(position, /\S+?\{.*?\}/)
                    if (refRange && beginEndRange.contains(labelPos)) {
                        return {texString: t.texString, envname: t.envname, range: refRange}
                    }
                }
            }
        }
        return undefined
    }

    findMathEnvIncludingPosition(document: ITextDocumentLike, position: vscode.Position): TexMathEnv | undefined {
        const limit = vscode.workspace.getConfiguration('latex-toybox').get('hover.preview.maxLines') as number
        const envNamePatMathMode = /(align|align\*|alignat|alignat\*|eqnarray|eqnarray\*|equation|equation\*|gather|gather\*)/
        const envBeginPatMathMode = /\\\[|\\\(|\\begin\{(align|align\*|alignat|alignat\*|eqnarray|eqnarray\*|equation|equation\*|gather|gather\*)\}/
        let texMath = this.findHoverOnTex(document, position)
        if (texMath && (texMath.envname === '$' || texMath.envname.match(envNamePatMathMode))) {
            return texMath
        }
        const beginPos = this.findBeginPair(document, envBeginPatMathMode, position, limit)
        if (beginPos) {
            texMath = this.findHoverOnTex(document, beginPos)
            if (texMath) {
                const beginEndRange = texMath.range
                if (beginEndRange.contains(position)) {
                    return texMath
                }
            }
        }
        return
    }

    private getFirstRememberedSubstring(s: string, pat: RegExp): string {
        const m = s.match(pat)
        if (m && m[1]) {
            return m[1]
        }
        return 'never return here'
    }

    //  \begin{...}                \end{...}
    //             ^
    //             startPos1
    findEndPair(document: ITextDocumentLike, endPat: RegExp, startPos1: vscode.Position): vscode.Position | undefined {
        const currentLine = document.lineAt(startPos1).text.substring(startPos1.character)
        const l = stripCommentsAndVerbatim(currentLine)
        let m = l.match(endPat)
        if (m && m.index !== undefined) {
            return startPos1.translate(0, m.index + m[0].length)
        }

        let lineNum = startPos1.line + 1
        while (lineNum <= document.lineCount) {
            m = stripCommentsAndVerbatim(document.lineAt(lineNum).text).match(endPat)
            if (m && m.index !== undefined) {
                return new vscode.Position(lineNum, m.index + m[0].length)
            }
            lineNum += 1
        }
        return undefined
    }

    //  \begin{...}                \end{...}
    //  ^                          ^
    //  return pos                 endPos1
    private findBeginPair(document: ITextDocumentLike, beginPat: RegExp, endPos1: vscode.Position, limit: number): vscode.Position | undefined {
        const currentLine = document.lineAt(endPos1).text.substring(0, endPos1.character)
        let l = stripCommentsAndVerbatim(currentLine)
        let m = l.match(beginPat)
        if (m && m.index !== undefined) {
            return new vscode.Position(endPos1.line, m.index)
        }
        let lineNum = endPos1.line - 1
        let i = 0
        while (lineNum >= 0 && i < limit) {
            l = document.lineAt(lineNum).text
            l = stripCommentsAndVerbatim(l)
            m = l.match(beginPat)
            if (m && m.index !== undefined) {
                return new vscode.Position(lineNum, m.index)
            }
            lineNum -= 1
            i += 1
        }
        return undefined
    }

    //  \begin{...}                \end{...}
    //  ^
    //  startPos
    private findHoverOnEnv(document: ITextDocumentLike, envname: string, startPos: vscode.Position): TexMathEnv | undefined {
        const pattern = new RegExp('\\\\end\\{' + utils.escapeRegExp(envname) + '\\}')
        const startPos1 = startPos.translate(0, envname.length + '\\begin{}'.length)
        const endPos = this.findEndPair(document, pattern, startPos1)
        if (endPos) {
            const range = new vscode.Range(startPos, endPos)
            return {texString: document.getText(range), range, envname}
        }
        return undefined
    }

    //  \[                \]
    //  ^
    //  startPos
    private findHoverOnParen(document: ITextDocumentLike, envname: string, startPos: vscode.Position): TexMathEnv | undefined {
        const pattern = envname === '\\[' ? /\\\]/ : envname === '\\(' ? /\\\)/ : /\$\$/
        const startPos1 = startPos.translate(0, envname.length)
        const endPos = this.findEndPair(document, pattern, startPos1)
        if (endPos) {
            const range = new vscode.Range(startPos, endPos)
            return {texString: document.getText(range), range, envname}
        }
        return undefined
    }

    private findHoverOnInline(document: ITextDocumentLike, position: vscode.Position): TexMathEnv | undefined {
        const currentLine = document.lineAt(position).text
        const regex = /(?<!\$|\\)\$(?!\$)(?:\\.|[^\\])+?\$|\\\(.+?\\\)/
        let s = currentLine
        let base = 0
        let m: RegExpMatchArray | null = s.match(regex)
        while (m) {
            if (m.index !== undefined) {
                const matchStart = base + m.index
                const matchEnd = base + m.index + m[0].length
                if ( matchStart <= position.character && position.character <= matchEnd ) {
                    const range = new vscode.Range(position.line, matchStart, position.line, matchEnd)
                    return {texString: document.getText(range), range, envname: '$'}
                } else {
                    base = matchEnd
                    s = currentLine.substring(base)
                }
            } else {
                break
            }
            m = s.match(regex)
        }
        return undefined
    }
}
