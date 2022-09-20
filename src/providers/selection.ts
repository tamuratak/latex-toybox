import {latexParser} from 'latex-utensils'
import * as vscode from 'vscode'

import type {UtensilsParserLocator} from '../interfaces'
import { LuPos, LuRange, toLuPos, toVscodeRange } from '../utils/utensils'


export interface IContent {
    content: latexParser.Node[],
    contentLuRange: LuRange,
    startSep: latexParser.Node | undefined,
    endSep: latexParser.Node | undefined
}

interface IExtension extends UtensilsParserLocator { }

export class SelectionRangeProvider implements vscode.SelectionRangeProvider {

    constructor(private readonly extension: IExtension) {}

    async provideSelectionRanges(document: vscode.TextDocument, positions: vscode.Position[]) {
        const content = document.getText()
        const latexAst = await this.extension.pegParser.parseLatex(content, {enableMathCharacterLocation: true})
        if (!latexAst) {
            return []
        }
        const ret: vscode.SelectionRange[] = []
        positions.forEach(pos => {
            const lupos = toLuPos(pos)
            const result = latexParser.findNodeAt(
                latexAst.content,
                lupos
            )
            const selectionRange = this.resultToSelectionRange(lupos, result)
            if (selectionRange) {
                ret.push(selectionRange)
            }
        })
        return ret
    }

    private getInnerContentLuRange(node: latexParser.Node): LuRange | undefined {
        if (latexParser.isEnvironment(node) || latexParser.isMathEnv(node) || latexParser.isMathEnvAligned(node)) {
            return new LuRange({
                start: {
                    line: node.location.start.line,
                    column: node.location.start.column + '\\begin{}'.length + node.name.length
                },
                end: {
                    line: node.location.end.line,
                    column: node.location.end.column - '\\end{}'.length - node.name.length
                }
            })
        } else if (latexParser.isGroup(node) || latexParser.isInlienMath(node)) {
            return new LuRange({
                start: {
                    line: node.location.start.line,
                    column: node.location.start.column + 1
                },
                end: {
                    line: node.location.end.line,
                    column: node.location.end.column - 1
                }
            })
        } else if (latexParser.isLabelCommand(node)) {
            return new LuRange({
                start: {
                    line: node.location.start.line,
                    column: node.location.start.column + '\\{'.length + node.name.length
                },
                end: {
                    line: node.location.end.line,
                    column: node.location.end.column - '}'.length
                }
            })
        } else if (latexParser.isMathDelimiters(node)) {
            return new LuRange({
                start: {
                    line: node.location.start.line,
                    column: node.location.start.column + node.left.length + node.lcommand.length
                },
                end: {
                    line: node.location.end.line,
                    column: node.location.end.column - node.right.length - node.rcommand.length
                }
            })
        }
        return
    }

    private findInnerContentIncludingPos(
        lupos: LuPos,
        content: latexParser.Node[],
        sepNodes: latexParser.Node[],
        innerContentRange: LuRange | undefined
    ): IContent | undefined {
        const startSep = Array.from(sepNodes).reverse().find((node) => node.location && lupos.isAfterOrEqual(node.location.end))
        const endSep = sepNodes.find((node) => node.location && lupos.isBeforeOrEqual(node.location.start))
        const startSepPos = startSep?.location ? LuPos.from(startSep.location.end) : innerContentRange?.start
        const endSepPos = endSep?.location ? LuPos.from(endSep.location.start) : innerContentRange?.end
        if (!startSepPos || !endSepPos) {
            return
        }
        const innerContent = content.filter((node) => {
            return node.location && startSepPos.isBeforeOrEqual(node.location.start) && endSepPos.isAfterOrEqual(node.location.end)
        })
        return {
            content: innerContent,
            contentLuRange: new LuRange({
                start: startSepPos,
                end: endSepPos
            }),
            startSep,
            endSep
        }
    }

    private resultToSelectionRange(
        lupos: LuPos,
        findNodeAtResult: ReturnType<typeof latexParser.findNodeAt>
    ): vscode.SelectionRange | undefined {
        if (!findNodeAtResult) {
            return
        }
        const curNode = findNodeAtResult.node
        const parentNode = findNodeAtResult.parent
        const parentSelectionRange = parentNode ? this.resultToSelectionRange(lupos, parentNode) : undefined
        if (!curNode.location) {
            return parentSelectionRange
        }
        const curRange = toVscodeRange(curNode.location)
        let curSelectionRange = new vscode.SelectionRange(curRange, parentSelectionRange)
        let innerContentLuRange = this.getInnerContentLuRange(curNode)
        if (innerContentLuRange) {
            if (!innerContentLuRange.contains(lupos)) {
                return curSelectionRange
            }
            const newCurRange = toVscodeRange(innerContentLuRange)
            curSelectionRange = new vscode.SelectionRange(newCurRange, curSelectionRange)
        }
        if (latexParser.hasContentArray(curNode)) {
            let innerContent = curNode.content
            let newInnerContent: IContent | undefined
            if (latexParser.isEnvironment(curNode) && (curNode.name === 'itemize' || curNode.name === 'enumerate')) {
                let itemNodes = curNode.content.filter(latexParser.isCommand)
                itemNodes = itemNodes.filter((node) => node.name === 'item')
                newInnerContent = this.findInnerContentIncludingPos(lupos, innerContent, itemNodes, innerContentLuRange)
                if (newInnerContent) {
                    if (newInnerContent.startSep?.location) {
                        const start = LuPos.from(newInnerContent.startSep.location.start)
                        innerContent = newInnerContent.content
                        innerContentLuRange = newInnerContent.contentLuRange
                        const newContentRange = toVscodeRange({start, end:innerContentLuRange.end})
                        curSelectionRange = new vscode.SelectionRange(newContentRange, curSelectionRange)
                    }
                    innerContent = newInnerContent.content
                    innerContentLuRange = newInnerContent.contentLuRange
                    const newContentRange = toVscodeRange(innerContentLuRange)
                    curSelectionRange = new vscode.SelectionRange(newContentRange, curSelectionRange)
                }
            }
            const linebreaksNodes = innerContent.filter(latexParser.isLinebreak)
            newInnerContent = this.findInnerContentIncludingPos(lupos, innerContent, linebreaksNodes, innerContentLuRange)
            if (newInnerContent) {
                if (newInnerContent.endSep?.location) {
                    const end = LuPos.from(newInnerContent.endSep.location.end)
                    innerContent = newInnerContent.content
                    innerContentLuRange = newInnerContent.contentLuRange
                    const newContentRange = toVscodeRange({start: innerContentLuRange.start, end})
                    curSelectionRange = new vscode.SelectionRange(newContentRange, curSelectionRange)
                }
                innerContent = newInnerContent.content
                innerContentLuRange = newInnerContent.contentLuRange
                const newContentRange = toVscodeRange(innerContentLuRange)
                curSelectionRange = new vscode.SelectionRange(newContentRange, curSelectionRange)
            }
            const alignmentTabNodes = innerContent.filter(latexParser.isAlignmentTab)
            newInnerContent = this.findInnerContentIncludingPos(lupos, innerContent, alignmentTabNodes, innerContentLuRange)
            if (newInnerContent) {
                // curContent = newContent.innerContent
                innerContentLuRange = newInnerContent.contentLuRange
                const newContentRange = toVscodeRange(innerContentLuRange)
                curSelectionRange = new vscode.SelectionRange(newContentRange, curSelectionRange)
            }
        }
        return curSelectionRange
    }

}
