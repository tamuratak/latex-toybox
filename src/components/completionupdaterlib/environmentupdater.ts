import { latexParser } from 'latex-utensils'
import { CmdEnvSuggestion } from '../../providers/completionlib/command.js'
import type { Manager } from '../manager.js'
import { EnvKind } from '../../providers/completionlib/completionkind.js'


export class EnvironmentUpdater {

    constructor(private readonly extension: {
        readonly manager: Manager
    }) { }

    /**
     * Updates the Manager cache for environments used in `file` with `nodes`.
     * @param file The path of a LaTeX file.
     * @param nodes AST of a LaTeX file.
     */
    update(file: string, nodes: latexParser.Node[], lines: string[]) {
        const cache = this.extension.manager.getCachedContent(file)
        if (cache === undefined) {
            return
        }
        cache.element.environment = this.getEnvFromNodeArray(nodes, lines, new Set<string>())
    }

    // This function will return all environments in a node array, including sub-nodes
    private getEnvFromNodeArray(nodes: latexParser.Node[], lines: string[], memo: Set<string>): CmdEnvSuggestion[] {
        let envs: CmdEnvSuggestion[] = []
        for (let index = 0; index < nodes.length; ++index) {
            envs = envs.concat(this.getEnvFromNode(nodes[index], lines, memo))
        }
        return envs
    }

    private getEnvFromNode(node: latexParser.Node, lines: string[], memo: Set<string>): CmdEnvSuggestion[] {
        let envs: CmdEnvSuggestion[] = []
        // Here we only check `isEnvironment` which excludes `align*` and `verbatim`.
        // Nonetheless, they have already been included in `defaultEnvs`.
        if (latexParser.isEnvironment(node) && !memo.has(node.name)) {
            memo.add(node.name)
            const env = this.createEnvSuggestion(node.name)
            envs.push(env)
        } else if (latexParser.isCommand(node) && ['newtheorem', 'newtheorem*', 'newenvironment'].includes(node.name)){
            const arg = node.args[0]?.content[0]
            if (latexParser.isTextString(arg)) {
                const name = arg.content
                if (!memo.has(name)) {
                    memo.add(name)
                    const env = this.createEnvSuggestion(name)
                    envs.push(env)
                }
            }
        }
        if (latexParser.hasContentArray(node)) {
            envs = envs.concat(this.getEnvFromNodeArray(node.content, lines, memo))
        }
        return envs
    }

    private createEnvSuggestion(name: string) {
        const documentation = '`' + name + '`'
        const filterText = name
        return new CmdEnvSuggestion(
            name,
            '',
            { name, args: '' },
            EnvKind,
            { documentation, filterText }
        )
    }

}
