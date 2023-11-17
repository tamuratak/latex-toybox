import * as vscode from 'vscode'
import { latexParser } from 'latex-utensils'
import { CmdEnvSuggestion } from '../../../providers/completionlib/command.js'
import { CommandNameDuplicationDetector, CommandSignatureDuplicationDetector, isTriggerSuggestNeeded } from '../../../providers/completionlib/commandlib/commandlib.js'
import type { Completer } from '../../../providers/completion.js'
import type { Manager } from '../../manager.js'
import { CommandKind } from '../../../providers/completionlib/completionkind.js'


export class CommandFinder {
    definedCmds = new Map<string, {file: string, location: vscode.Location}>()

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
           const name = node.token.slice(1)
            if (!commandNameDuplicationDetector.has(name)) {
                const documentation = '`' + name + '`'
                const insertText = new vscode.SnippetString(name + this.getTabStopsFromNode(node))
                const filterText = name
                let command: vscode.Command | undefined
                if (isTriggerSuggestNeeded(name)) {
                    command = { title: 'Post-Action', command: 'editor.action.triggerSuggest' }
                }
                const cmd = new CmdEnvSuggestion(
                    `\\${name}`,
                    '',
                    {name, args: this.getArgsFromNode(node)},
                    CommandKind,
                    {documentation, insertText, filterText, command}
                )
                cmds.push(cmd)
                commandNameDuplicationDetector.add(name)
            }
        } else if (latexParser.isCommand(node)) {
            if (!commandNameDuplicationDetector.has(node.name)) {
                const documentation = '`' + node.name + '`'
                const insertText = new vscode.SnippetString(node.name + this.getTabStopsFromNode(node))
                let command: vscode.Command | undefined
                if (isTriggerSuggestNeeded(node.name)) {
                    command = { title: 'Post-Action', command: 'editor.action.triggerSuggest' }
                }
                const cmd = new CmdEnvSuggestion(
                    `\\${node.name}`,
                    this.whichPackageProvidesCommand(node.name),
                    { name: node.name, args: this.getArgsFromNode(node) },
                    CommandKind,
                    {documentation, insertText, command}
                )
                cmds.push(cmd)
                commandNameDuplicationDetector.add(node.name)
            }
            if (['newcommand', 'renewcommand', 'providecommand', 'DeclareMathOperator', 'DeclarePairedDelimiter', 'DeclarePairedDelimiterX', 'DeclarePairedDelimiterXPP'].includes(node.name.replace(/\*$/, '')) &&
                Array.isArray(node.args) && node.args.length > 0) {
                const label = (node.args[0].content[0] as latexParser.Command).name
                let tabStops = ''
                let args = ''
                if (latexParser.isOptionalArg(node.args[1])) {
                    const numArgs = parseInt((node.args[1].content[0] as latexParser.TextString).content)
                    for (let i = 1; i <= numArgs; ++i) {
                        tabStops += '{${' + i + '}}'
                        args += '{}'
                    }
                }
                if (!commandNameDuplicationDetector.has(label)) {
                    const documentation = '`' + label + '`'
                    const insertText = new vscode.SnippetString(label + tabStops)
                    const filterText = label
                    let command: vscode.Command | undefined
                    if (isTriggerSuggestNeeded(label)) {
                        command = { title: 'Post-Action', command: 'editor.action.triggerSuggest' }
                    }
                    const cmd = new CmdEnvSuggestion(
                        `\\${label}`,
                        'user-defined',
                        {name: label, args},
                        CommandKind,
                        {documentation, insertText, filterText, command}
                    )
                    cmds.push(cmd)
                    this.definedCmds.set(label, {
                        file,
                        location: new vscode.Location(
                            vscode.Uri.file(file),
                            new vscode.Position(node.location.start.line - 1, node.location.start.column))
                    })
                    commandNameDuplicationDetector.add(label)
                }
            }
        }
        if (latexParser.hasContentArray(node)) {
            return cmds.concat(this.getCmdFromNodeArray(file, node.content, commandNameDuplicationDetector))
        }
        return cmds
    }

    private getArgsHelperFromNode(node: latexParser.Node, helper: (i: number) => string): string {
        let args = ''
        if (!('args' in node)) {
            return args
        }
        let index = 0
        if (latexParser.isCommand(node)) {
            node.args.forEach(arg => {
                ++index
                if (latexParser.isOptionalArg(arg)) {
                    args += '[' + helper(index) + ']'
                } else {
                    args += '{' + helper(index) + '}'
                }
            })
            return args
        }
        if (latexParser.isDefCommand(node)) {
            node.args.forEach(arg => {
                ++index
                if (latexParser.isCommandParameter(arg)) {
                    args += '{' + helper(index) + '}'
                }
            })
            return args
        }
        return args
    }

    private getTabStopsFromNode(node: latexParser.Node): string {
        return this.getArgsHelperFromNode(node, (i: number) => { return '${' + i + '}' })
    }

    private getArgsFromNode(node: latexParser.Node): string {
        return this.getArgsHelperFromNode(node, (_: number) => { return '' })
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
