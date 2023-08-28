import {latexParser} from 'latex-utensils'

import { CommandNameDuplicationDetector } from '../../providers/completer/commandlib/commandlib'
import { CommandFinder } from './commandupdaterlib/commandfinder'
import type { Completer } from '../../providers/completion'
import type { Manager } from '../manager'


export class CommandUpdater {
    readonly commandFinder: CommandFinder

    constructor(private readonly extension: {
        readonly completer: Completer,
        readonly manager: Manager
    }) {
        this.commandFinder = new CommandFinder(extension)
    }

    get definedCmds() {
        return this.commandFinder.definedCmds
    }

    /**
     * Updates the Manager cache for commands used in `file` with `nodes`.
     * @param file The path of a LaTeX file.
     * @param nodes AST of a LaTeX file.
     */
    update(file: string, nodes: latexParser.Node[]) {
        // First, we must update the package list
        this.updatePkgWithNodeArray(file, nodes)
        // Remove newcommand cmds, because they will be re-insert in the next step
        this.definedCmds.forEach((entry,cmd) => {
            if (entry.file === file) {
                this.definedCmds.delete(cmd)
            }
        })
        const cache = this.extension.manager.getCachedContent(file)
        if (cache === undefined) {
            return
        }
        cache.element.command = this.commandFinder.getCmdFromNodeArray(file, nodes, new CommandNameDuplicationDetector())
    }

    private updatePkgWithNodeArray(file: string, nodes: latexParser.Node[]) {
        nodes.forEach(node => {
            if ( latexParser.isCommand(node) && (node.name === 'usepackage' || node.name === 'documentclass') ) {
                node.args.forEach(arg => {
                    if (latexParser.isOptionalArg(arg)) {
                        return
                    }
                    for (const c of arg.content) {
                        if (!latexParser.isTextString(c)) {
                            continue
                        }
                        c.content.split(',').forEach(pkg => {
                            pkg = pkg.trim()
                            if (pkg === '') {
                                return
                            }
                            if (node.name === 'documentclass') {
                                pkg = 'class-' + pkg
                            }
                            const cache = this.extension.manager.getCachedContent(file)
                            cache?.element.package.add(pkg)
                        })
                    }
                })
            } else {
                if (latexParser.hasContentArray(node)) {
                    this.updatePkgWithNodeArray(file, node.content)
                }
            }
        })
    }

}
