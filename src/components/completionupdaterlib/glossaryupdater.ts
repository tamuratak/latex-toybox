import {latexParser} from 'latex-utensils'

import {GlossarySuggestion, GlossaryType} from '../../providers/completer/glossary'
import { toVscodePosition } from '../../utils/utensils'
import { Manager } from '../manager'
import { ReferenceKind } from '../../providers/completer/completionkind'

interface GlossaryEntry {
    readonly label: string | undefined,
    readonly description: string | undefined
}

export class GlossaryUpdater {

    constructor(private readonly extension: {
        readonly manager: Manager
    }) { }

    private getGlossaryFromNodeArray(nodes: latexParser.Node[], file: string): GlossarySuggestion[] {
        const glossaries: GlossarySuggestion[] = []
        let entry: GlossaryEntry
        let type: GlossaryType | undefined

        nodes.forEach(node => {
            if (latexParser.isCommand(node) && node.args.length > 0) {
                if (['newglossaryentry', 'provideglossaryentry'].includes(node.name)) {
                    type = GlossaryType.glossary
                    entry = this.getShortNodeDescription(node)
                } else if(['longnewglossaryentry', 'longprovideglossaryentry'].includes(node.name)) {
                    type = GlossaryType.glossary
                    entry = this.getLongNodeLabelDescription(node)
                } else if(['newacronym', 'newabbreviation', 'newabbr'].includes(node.name)) {
                    type = GlossaryType.acronym
                    entry = this.getLongNodeLabelDescription(node)
                }
                if (type !== undefined && entry.description !== undefined && entry.label !== undefined) {
                    glossaries.push({
                        type,
                        file,
                        position: toVscodePosition(node.location.start),
                        label: entry.label,
                        detail: entry.description,
                        kind: ReferenceKind
                    })
                }
            }
        })
        return glossaries
    }

    /**
     * Parse the description from "long nodes" such as \newacronym and \longnewglossaryentry
     *
     * Spec: \newacronym[〈key-val list〉]{〈label〉}{〈abbrv〉}{〈description〉}
     *
     * Fairly straightforward, a \newacronym command takes the form
     *     \newacronym[optional parameters]{lw}{LW}{LaTeX Workshop}
     *
     *
     * @param node the \newacronym node from the parser
     * @return the pair (label, description)
     */
    private getLongNodeLabelDescription(node: latexParser.Command): GlossaryEntry {
        let description: string | undefined = undefined
        let label: string | undefined = undefined

        // We expect 3 arguments + 1 optional argument
        if (node.args.length < 3 || node.args.length > 4) {
            return {label: undefined, description: undefined}
        }
        const hasOptionalArg: boolean = latexParser.isOptionalArg(node.args[0])

        // First arg is optional, we must have 4 arguments
        if (hasOptionalArg && node.args.length !== 4) {
            return {label: undefined, description: undefined}
        }

        const labelNode = hasOptionalArg ? node.args[1] : node.args[0]
        const descriptionNode = hasOptionalArg ? node.args[3] : node.args[2]
        if (latexParser.isGroup(descriptionNode)) {
            description = latexParser.stringify(descriptionNode).slice(1, -1)
        }

        if (latexParser.isGroup(labelNode)) {
            label = latexParser.stringify(labelNode).slice(1, -1)
        }

        return {label, description}
    }

    /**
     * Parse the description from "short nodes" like \newglossaryentry
     *
     * Spec: \newglossaryentry{〈label〉}{〈key=value list〉}
     *
     * Example glossary entries:
     *     \newglossaryentry{lw}{name={LaTeX Workshop}, description={What this extension is}}
     *     \newglossaryentry{vscode}{name=VSCode, description=Editor}
     *
     * Note: descriptions can be single words or a {group of words}
     *
     * @param node the \newglossaryentry node from the parser
     * @returns the value of the description field
     */
    private getShortNodeDescription(node: latexParser.Command): GlossaryEntry {
        let result: RegExpExecArray | null
        let description: string | undefined = undefined
        let label: string | undefined = undefined
        let lastNodeWasDescription = false

        // We expect 2 arguments
        if (node.args.length !== 2) {
            return {label: undefined, description: undefined}
        }

        // Get label
        if (latexParser.isGroup(node.args[0])) {
            label = latexParser.stringify(node.args[0]).slice(1, -1)
        }

        // Get description
        if (latexParser.isGroup(node.args[1])) {
            for (const subNode of node.args[1].content) {
                if (latexParser.isTextString(subNode)) {
                    // Description is of the form description=single_word
                    if ((result = /description=(.*)/.exec(subNode.content)) !== null) {
                        if (result[1] !== '') {
                            description = result[1]
                            break
                        }
                        lastNodeWasDescription = true
                    }
                } else if (lastNodeWasDescription && latexParser.isGroup(subNode)) {
                    // otherwise we have description={group of words}
                    description = latexParser.stringify(subNode).slice(1, -1)
                    break
                }
            }
        }

        return {label, description}
    }

    /**
     * Update the Manager cache for references defined in `file` with `nodes`.
     * @param file The path of a LaTeX file.
     * @param nodes AST of a LaTeX file.
     */
    update(file: string, nodes: latexParser.Node[]) {
        const cache = this.extension.manager.getCachedContent(file)
        if (cache === undefined) {
            return
        }
        cache.element.glossary = this.getGlossaryFromNodeArray(nodes, file)
    }

}
