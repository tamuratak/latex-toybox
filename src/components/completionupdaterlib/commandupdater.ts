import {latexParser} from 'latex-utensils'

import type {CompleterLocator, ManagerLocator} from '../../interfaces'
import { CommandFinder, CommandNameDuplicationDetector } from '../../providers/completer/commandlib/commandfinder'

interface IExtension extends
    CompleterLocator,
    ManagerLocator { }

export class CommandUpdater {
    private readonly extension: IExtension
    readonly commandFinder: CommandFinder

    constructor(extension: IExtension) {
        this.extension = extension
        this.commandFinder = new CommandFinder(extension)
    }

    get definedCmds() {
        return this.commandFinder.definedCmds
    }

    /**
     * Updates the Manager cache for commands used in `file` with `nodes`.
     * If `nodes` is `undefined`, `content` is parsed with regular expressions,
     * and the result is used to update the cache.
     * @param file The path of a LaTeX file.
     * @param nodes AST of a LaTeX file.
     * @param content The content of a LaTeX file.
     */
    update(file: string, nodes?: latexParser.Node[], content?: string) {
        // First, we must update the package list
        this.updatePkg(file, nodes, content)
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
        if (nodes !== undefined) {
            cache.element.command = this.commandFinder.getCmdFromNodeArray(file, nodes, new CommandNameDuplicationDetector())
        } else if (content !== undefined) {
            cache.element.command = this.commandFinder.getCmdFromContent(file, content)
        }
    }

    /**
     * Updates the Manager cache for packages used in `file` with `nodes`.
     * If `nodes` is `undefined`, `content` is parsed with regular expressions,
     * and the result is used to update the cache.
     *
     * @param file The path of a LaTeX file.
     * @param nodes AST of a LaTeX file.
     * @param content The content of a LaTeX file.
     */
    private updatePkg(file: string, nodes?: latexParser.Node[], content?: string) {
        if (nodes !== undefined) {
            this.updatePkgWithNodeArray(file, nodes)
        } else if (content !== undefined) {
            const pkgReg = /\\usepackage(?:\[[^[\]{}]*\])?{(.*)}/g

            while (true) {
                const result = pkgReg.exec(content)
                if (result === null) {
                    break
                }
                result[1].split(',').forEach(pkg => {
                    pkg = pkg.trim()
                    if (pkg === '') {
                        return
                    }
                    const cache = this.extension.manager.getCachedContent(file)
                    if (cache === undefined) {
                        return
                    }
                    let filePkgs = cache.element.package
                    if (!filePkgs) {
                        filePkgs = new Set<string>()
                        cache.element.package = filePkgs
                    }
                    filePkgs.add(pkg)
                })
            }
        }
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
                            if (cache === undefined) {
                                return
                            }
                            let pkgs = cache.element.package
                            if (!pkgs) {
                                pkgs = new Set<string>()
                                cache.element.package = pkgs
                            }
                            pkgs.add(pkg)
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
