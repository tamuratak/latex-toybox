import * as vscode from 'vscode'
import { latexParser } from 'latex-utensils'
import { isNewCommand } from '../../utils/newcommand.js'

import type { LabelDefinitionElement } from '../../providers/completionlib/labeldefinition.js'
import { toVscodeRange } from '../../utils/utensils.js'
import type { Manager } from '../manager.js'


export class LabelDefinitionUpdater {
    private readonly envsToSkip = ['tikzpicture']

    constructor(private readonly extension: {
        readonly manager: Manager
    }) { }

    /**
     * Updates the Manager cache for references defined in `file` with `nodes`.
     * @param file The path of a LaTeX file.
     * @param nodes AST of a LaTeX file.
     * @param lines The lines of the content. They are used to generate the documentation of completion items.
     */
    update(file: string, nodes: latexParser.Node[], lines: string[]) {
        const cache = this.extension.manager.getCachedContent(file)
        if (cache === undefined) {
            return
        }
        cache.element.labelDefinition = this.extractLabelDefinitionsFromNodeArray(nodes, lines)
    }

    // This function will return all references in a node array, including sub-nodes
    private extractLabelDefinitionsFromNodeArray(nodes: latexParser.Node[], lines: string[]): LabelDefinitionElement[] {
        let refs: LabelDefinitionElement[] = []
        for (let index = 0; index < nodes.length; ++index) {
            if (index < nodes.length - 1) {
                // Also pass the next node to handle cases like `label={some-text}`
                refs = refs.concat(this.extractLabelDefinitionsFromNode(nodes[index], lines, nodes[index+1]))
            } else {
                refs = refs.concat(this.extractLabelDefinitionsFromNode(nodes[index], lines))
            }
        }
        return refs
    }

    // This function will return the reference defined by the node, or all references in `content`
    private extractLabelDefinitionsFromNode(node: latexParser.Node, lines: string[], nextNode?: latexParser.Node): LabelDefinitionElement[] {
        const configuration = vscode.workspace.getConfiguration('latex-toybox')
        const useLabelKeyVal = configuration.get('intellisense.label.keyval')
        const refs: LabelDefinitionElement[] = []
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
                documentation: lines.slice(node.location.start.line - 2, node.location.end.line + 4).join('\n'),
                range: toVscodeRange(node.location)
            })
            return refs
        }
        if (latexParser.hasContentArray(node)) {
            return this.extractLabelDefinitionsFromNodeArray(node.content, lines)
        }
        if (latexParser.hasArgsArray(node)) {
            return this.extractLabelDefinitionsFromNodeArray(node.args, lines)
        }
        if (latexParser.isLstlisting(node)) {
            const arg = node.arg
            if (arg) {
                return this.extractLabelDefinitionsFromNode(arg, lines)
            }
        }
        return refs
    }

}
