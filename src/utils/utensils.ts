import { latexParser, bibtexParser } from 'latex-utensils'
import { Position, Range, TextDocument } from 'vscode'

export type LatexAst = latexParser.LatexAst
export type BibtexAst = bibtexParser.BibtexAst

export interface ILuRange {
    readonly start: ILuPos,
    readonly end: ILuPos
}

export class LuRange implements ILuRange {
    readonly start: LuPos
    readonly end: LuPos

    constructor(arg: {start: ILuPos, end: ILuPos}) {
        this.start = LuPos.from(arg.start)
        this.end = LuPos.from(arg.end)
    }

    contains(pos: ILuPos): boolean {
        return this.start.isBeforeOrEqual(pos) && this.end.isAfterOrEqual(pos)
    }
}

export interface ILuPos {
    readonly line: number,
    readonly column: number
}

export class LuPos implements ILuPos {

    static from(loc: ILuPos) {
        return new LuPos(loc.line, loc.column)
    }

    constructor(
        readonly line: number,
        readonly column: number
    ) {}

    isAfter(other: ILuPos): boolean {
        return this.line > other.line || ( this.line === other.line && this.column > other.column )
    }

    isAfterOrEqual(other: ILuPos): boolean {
        return this.line > other.line || ( this.line === other.line && this.column >= other.column )
    }

    isBefore(other: ILuPos): boolean {
        return this.line < other.line || ( this.line === other.line && this.column < other.column )
    }

    isBeforeOrEqual(other: ILuPos): boolean {
        return this.line < other.line || ( this.line === other.line && this.column <= other.column )
    }

}

export function toVscodePosition(pos: { line: number, column: number }) {
    return new Position(pos.line - 1, pos.column - 1)
}

export function toVscodeRange(loc: ILuRange): Range {
    return new Range(toVscodePosition(loc.start), toVscodePosition(loc.end))
}

export function toLuPos(pos: Position): LuPos {
    return new LuPos(pos.line + 1, pos.character + 1)
}

export function toLuRange(range: Range): LuRange {
    return new LuRange({
        start: toLuPos(range.start),
        end: toLuPos(range.end)
    })
}

export function convertOffsetToPosition(offset: number, doc: string): Position {
    const leftString = doc.substring(0, offset)
    const match = Array.from(leftString.matchAll(/\n/g))
    const line = match.length
    const rightNewlineIndex = match[match.length-1]?.index
    let character: number
    if (rightNewlineIndex !== undefined) {
        character = offset - rightNewlineIndex - 1
    } else {
        character = offset
    }
    return new Position(line, character)
}

export function convertPositionToOffset(position: Position, doc: string): number {
    const arry = doc.split('\n')
    const sum = arry.slice(0, position.line).map((line) => line.length + 1).reduce((prev, e) => prev + e, 0)
    return sum + position.character
}

export interface PrevNextNodes {
    readonly prev: latexParser.Node | undefined,
    readonly next: latexParser.Node | undefined
}

export function findPrevNextNode(cursorOffset: number, nodeArray: latexParser.Node[]): PrevNextNodes {
    let prev: latexParser.Node | undefined
    for (const node of nodeArray) {
        const loc = node.location
        if (loc && cursorOffset <= loc.start.offset) {
            return { prev, next: node }
        } else {
            prev = node
        }
    }
    return { prev, next: undefined }
}

export function findNodeContactedWithPosition(document: TextDocument, position: Position, ast: latexParser.LatexAst): latexParser.Node | undefined {
    const loc = toLuPos(position)
    const findResult = latexParser.findNodeAt(ast.content, loc)
    const node = findResult?.node
    if (!node?.location) {
        return
    }
    const nodePos = toVscodePosition(node.location.start)
    if (nodePos.isEqual(position)) {
        return node
    }
    const cursorOffset = document.offsetAt(position)
    let nodeArray: latexParser.Node[] | undefined
    if (latexParser.hasContentArray(node)) {
        nodeArray = node.content
    } else {
        const parentNode = findResult?.parent?.node
        if (parentNode && latexParser.hasContentArray(parentNode)) {
            nodeArray = parentNode.content
        }
    }
    if (!nodeArray) {
        return
    }
    const { prev, next } = findPrevNextNode(cursorOffset, nodeArray)
    if (prev && prev.location && prev.location.end.offset === cursorOffset) {
        return prev
    }
    if (next && next.location && next.location.start.offset === cursorOffset) {
        return next
    }
    return
}

export function isSubOrSuper(node: latexParser.Node | undefined): node is latexParser.Subscript | latexParser.Superscript {
    return latexParser.isSubscript(node) || latexParser.isSuperscript(node)
}
