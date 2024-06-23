import * as vscode from 'vscode'
import { latexParser } from 'latex-utensils'
import { CmdEnvSuggestion } from '../../../providers/completionlib/command.js'
import { type CommandNameDuplicationDetector, CommandSignatureDuplicationDetector, isTriggerSuggestNeeded } from '../../../providers/completionlib/commandlib/commandlib.js'
import type { Completer } from '../../../providers/completion.js'
import type { Manager } from '../../manager.js'
import { CommandKind } from '../../../providers/completionlib/completionkind.js'
import { getArgsFromNode, getDefCommandFromNode, getNewComanndFromNode, getTabStopsFromNode } from './commandfinderlib/commandfinderlib.js'


export class CommandFinder {
    definedCmds = new Map<string, { file: string, location: vscode.Location }>()

    constructor(private readonly extension: {
        readonly completer: Completer,
        readonly manager: Manager
    }) { }

    getCmdFromNodeArray(file: string, nodes: latexParser.Node[], commandNameDuplicationDetector: CommandNameDuplicationDetector): CmdEnvSuggestion[] {
        let cmds: CmdEnvSuggestion[] = []
        nodes.forEach(node => {
            cmds = cmds.concat(this.getCmdFromNode(file, node, commandNameDuplicationDetector))
        })
        return cmds
    }

    private getCmdFromNode(file: string, node: latexParser.Node, commandNameDuplicationDetector: CommandNameDuplicationDetector): CmdEnvSuggestion[] {
        const cmds: CmdEnvSuggestion[] = []
        if (latexParser.isDefCommand(node)) {
            const cmd = getDefCommandFromNode(node, commandNameDuplicationDetector)
            if (cmd !== undefined) {
                cmds.push(cmd)
                commandNameDuplicationDetector.add(cmd)
            }
        } else if (latexParser.isCommand(node)) {
            const name = node.name
            if (!commandNameDuplicationDetector.has(name)) {
                const documentation = '`' + name + '`'
                const insertText = new vscode.SnippetString(name + getTabStopsFromNode(node))
                let command: vscode.Command | undefined
                if (isTriggerSuggestNeeded(name)) {
                    command = { title: 'Post-Action', command: 'editor.action.triggerSuggest' }
                }
                const cmd = new CmdEnvSuggestion(
                    `\\${name}`,
                    this.whichPackageProvidesCommand(name),
                    { name, args: getArgsFromNode(node) },
                    CommandKind,
                    { documentation, insertText, command }
                )
                cmds.push(cmd)
                commandNameDuplicationDetector.add(cmd)
            }
            const cmd = getNewComanndFromNode(node, commandNameDuplicationDetector)
            if (cmd !== undefined) {
                cmds.push(cmd)
                this.definedCmds.set(cmd.label, {
                    file,
                    location: new vscode.Location(
                        vscode.Uri.file(file),
                        new vscode.Position(node.location.start.line - 1, node.location.start.column))
                })
                commandNameDuplicationDetector.add(cmd)
            }
        }
        if (latexParser.hasContentArray(node)) {
            return cmds.concat(this.getCmdFromNodeArray(file, node.content, commandNameDuplicationDetector))
        }
        return cmds
    }

    /**
     * Return the name of the package providing cmdName among all the packages
     * included in the rootFile. If no package matches, return ''
     *
     * @param cmdName the name of a command (without the leading '\')
     */
    private whichPackageProvidesCommand(cmdName: string): string {
        if (this.extension.manager.rootFile !== undefined) {
            for (const file of this.extension.manager.getIncludedTeX()) {
                const cachedPkgs = this.extension.manager.getCachedContent(file)?.element.package
                if (cachedPkgs === undefined) {
                    continue
                }
                for (const pkg of cachedPkgs) {
                    const commands = this.extension.completer.command.provideCmdInPkg(pkg, new CommandSignatureDuplicationDetector())
                    for (const cmd of commands) {
                        const label = cmd.label.slice(1)
                        if (label.startsWith(cmdName) &&
                            ((label.length === cmdName.length) ||
                                (label.charAt(cmdName.length) === '[') ||
                                (label.charAt(cmdName.length) === '{'))) {
                            return pkg
                        }
                    }
                }
            }
        }
        return ''
    }

}
