import * as vscode from 'vscode'
import {latexParser} from 'latex-utensils'
import {stripEnvironments, isNewCommand} from '../../utils/utils'

import type {ILwCompletionItem} from '../../providers/completer/interface'
import type {ManagerLocator} from '../../interfaces'

interface IExtension extends
    ManagerLocator { }

export class ReferenceUpdater {
    private readonly extension: IExtension
    private readonly envsToSkip = ['tikzpicture']

    constructor(extension: IExtension) {
        this.extension = extension
    }

    /**
     * Updates the Manager cache for references defined in `file` with `nodes`.
     * If `nodes` is `undefined`, `content` is parsed with regular expressions,
     * and the result is used to update the cache.
     * @param file The path of a LaTeX file.
     * @param nodes AST of a LaTeX file.
     * @param lines The lines of the content. They are used to generate the documentation of completion items.
     * @param content The content of a LaTeX file.
     */
    update(file: string, nodes?: latexParser.Node[], lines?: string[], content?: string) {
        const cache = this.extension.manager.getCachedContent(file)
        if (cache === undefined) {
            return
        }
        if (nodes !== undefined && lines !== undefined) {
            cache.element.reference = this.getRefFromNodeArray(nodes, lines)
        } else if (content !== undefined) {
            cache.element.reference = this.getRefFromContent(content)
        }
    }

    // This function will return all references in a node array, including sub-nodes
    private getRefFromNodeArray(nodes: latexParser.Node[], lines: string[]): ILwCompletionItem[] {
        let refs: ILwCompletionItem[] = []
        for (let index = 0; index < nodes.length; ++index) {
            if (index < nodes.length - 1) {
                // Also pass the next node to handle cases like `label={some-text}`
                refs = refs.concat(this.getRefFromNode(nodes[index], lines, nodes[index+1]))
            } else {
                refs = refs.concat(this.getRefFromNode(nodes[index], lines))
            }
        }
        return refs
    }

    // This function will return the reference defined by the node, or all references in `content`
    private getRefFromNode(node: latexParser.Node, lines: string[], nextNode?: latexParser.Node): ILwCompletionItem[] {
        const configuration = vscode.workspace.getConfiguration('latex-workshop')
        const useLabelKeyVal = configuration.get('intellisense.label.keyval')
        const refs: ILwCompletionItem[] = []
        let label = ''
        if (isNewCommand(node) || latexParser.isDefCommand(node)) {
            // Do not scan labels inside \newcommand & co
            return refs
        }
        if (latexParser.isEnvironment(node) && this.envsToSkip.includes(node.name)) {
            return refs
        }
        if (latexParser.isLabelCommand(node) && node.name === 'label') {
            // \label{some-text}
            label = node.label
        } else if (latexParser.isCommand(node) && node.name === 'label'
                    && node.args.length === 2
                    && latexParser.isOptionalArg(node.args[0])
                    && latexParser.isGroup(node.args[1])) {
            // \label[opt_arg]{actual_label}
            label = latexParser.stringify(node.args[1]).slice(1, -1)
        } else if (latexParser.isTextString(node) && node.content === 'label='
                    && useLabelKeyVal && nextNode !== undefined) {
            // label={some-text}
            label = latexParser.stringify(nextNode).slice(1, -1)
        }
        if (label !== '' &&
            (latexParser.isLabelCommand(node)
             || latexParser.isCommand(node)
             || latexParser.isTextString(node))) {
            refs.push({
                label,
                kind: vscode.CompletionItemKind.Reference,
                // One row before, four rows after
                documentation: lines.slice(node.location.start.line - 2, node.location.end.line + 4).join('\n'),
                // Here we abuse the definition of range to store the location of the reference definition
                range: new vscode.Range(node.location.start.line - 1, node.location.start.column,
                                        node.location.end.line - 1, node.location.end.column)
            })
            return refs
        }
        if (latexParser.hasContentArray(node)) {
            return this.getRefFromNodeArray(node.content, lines)
        }
        if (latexParser.hasArgsArray(node)) {
            return this.getRefFromNodeArray(node.args, lines)
        }
        if (latexParser.isLstlisting(node)) {
            const arg = (node as latexParser.Lstlisting).arg
            if (arg) {
                return this.getRefFromNode(arg, lines)
            }
        }
        return refs
    }

    private getRefFromContent(content: string): ILwCompletionItem[] {
        const refReg = /(?:\\label(?:\[[^[\]{}]*\])?|(?:^|[,\s])label=){([^#\\}]*)}/gm
        const refs: ILwCompletionItem[] = []
        const refList: string[] = []
        content = stripEnvironments(content, this.envsToSkip)
        while (true) {
            const result = refReg.exec(content)
            if (result === null) {
                break
            }
            if (refList.includes(result[1])) {
                continue
            }
            const prevContent = content.substring(0, content.substring(0, result.index).lastIndexOf('\n') - 1)
            const followLength = content.substring(result.index, content.length).split('\n', 4).join('\n').length
            const positionContent = content.substring(0, result.index).split('\n')

            refs.push({
                label: result[1],
                kind: vscode.CompletionItemKind.Reference,
                // One row before, four rows after
                documentation: content.substring(prevContent.lastIndexOf('\n') + 1, result.index + followLength),
                // Here we abuse the definition of range to store the location of the reference definition
                range: new vscode.Range(positionContent.length - 1, positionContent[positionContent.length - 1].length,
                                        positionContent.length - 1, positionContent[positionContent.length - 1].length)
            })
            refList.push(result[1])
        }
        return refs
    }

}
