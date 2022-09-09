import { latexParser } from 'latex-utensils'
import { Position, Range } from 'vscode'

export function locationToRange(location: latexParser.Location): Range {
    return new Range(location.start.line - 1, location.start.column - 1, location.end.line - 1, location.end.column - 1)
}

export function rangeToLocation(range: Range) {
    return {
        start: {
            line: range.start.line + 1,
            column: range.start.character + 1
        },
        end: {
            line: range.end.line + 1,
            column: range.end.character +1
        }
    }
}

export function convertOffsetToPosition(offset: number, doc: string): Position {
    const leftString = doc.substring(0, offset)
    const match = Array.from(leftString.matchAll(/\n/g))
    const line = match.length
    const rightNewlineIndex = match[match.length-1]?.index
    let character: number
    if (rightNewlineIndex) {
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

export function getContentRange(result: latexParser.FindResult<latexParser.Node>, doc: string): Range | undefined {
    const node = result.node
    if (latexParser.isMathDelimiters(node)) {
        const left = doc.indexOf(node.left, node.location.start.offset)
        const right = doc.lastIndexOf(node.rcommand, node.location.end.offset)
        if (left < 0 || right < 0) {
            return
        }
        const leftPos = convertOffsetToPosition(left + node.left.length, doc)
        const rightPos = convertOffsetToPosition(right, doc)
        return new Range(leftPos, rightPos)
    } else if (latexParser.isMatchingDelimiters(node)) {
        const left = doc.indexOf(node.left, node.location.start.offset)
        const right = doc.lastIndexOf('\\right', node.location.end.offset)
        if (left < 0 || right < 0) {
            return
        }
        const leftPos = convertOffsetToPosition(left + node.left.length, doc)
        const rightPos = convertOffsetToPosition(right, doc)
        return new Range(leftPos, rightPos)
    } else if (latexParser.isEnvironment(node)) {
        const args = node.args
        const left = args[args.length-1]?.location.end.offset ?? '\\begin{}'.length + node.name.length
        const right = doc.length - '\\end{}'.length - node.name.length
        const leftPos = convertOffsetToPosition(left, doc)
        const rightPos = convertOffsetToPosition(right, doc)
        return new Range(leftPos, rightPos)
    } else {
        const parent = result.parent
        if (parent) {
            return getContentRange(parent, doc)
        }
    }
    return
}
