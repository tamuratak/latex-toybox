import * as vscode from 'vscode'
import { latexParser } from 'latex-utensils'
import { CompleterLocator, ManagerLocator } from '../../../interfaces'
import { CmdEnvSuggestion } from '../../../providers/completer/command'
import { CommandNameDuplicationDetector, CommandSignatureDuplicationDetector, isTriggerSuggestNeeded } from '../../../providers/completer/commandlib/commandlib'


interface IExtension extends
    CompleterLocator,
    ManagerLocator { }

export class CommandFinder {
    private readonly extension: IExtension
    definedCmds = new Map<string, {file: string, location: vscode.Location}>()

    constructor(extension: IExtension) {
        this.extension = extension
    }

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
                    vscode.CompletionItemKind.Function,
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
                const cmd = new CmdEnvSuggestion(`\\${node.name}`,
                    this.whichPackageProvidesCommand(node.name),
                    { name: node.name, args: this.getArgsFromNode(node) },
                    vscode.CompletionItemKind.Function,
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
                        vscode.CompletionItemKind.Function,
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


    getCmdFromContent(file: string, content: string): CmdEnvSuggestion[] {
        const cmdReg = /\\([a-zA-Z@_]+(?::[a-zA-Z]*)?\*?)({[^{}]*})?({[^{}]*})?({[^{}]*})?/g
        const cmds: CmdEnvSuggestion[] = []
        const commandNameDuplicationDetector = new CommandNameDuplicationDetector()
        let explSyntaxOn: boolean = false
        while (true) {
            const result = cmdReg.exec(content)
            if (result === null) {
                break
            }
            if (result[1] === 'ExplSyntaxOn') {
                explSyntaxOn = true
                continue
            } else if (result[1] === 'ExplSyntaxOff') {
                explSyntaxOn = false
                continue
            }


            if (!explSyntaxOn) {
                const len = result[1].search(/[_:]/)
                if (len > -1) {
                    result[1] = result[1].slice(0, len)
                }
            }
            if (commandNameDuplicationDetector.has(result[1])) {
                continue
            }

            const documentation = '`' + result[1] + '`'
            const insertText = new vscode.SnippetString(result[1] + this.getTabStopsFromRegResult(result))
            const filterText = result[1]
            let command: vscode.Command | undefined
            if (isTriggerSuggestNeeded(result[1])) {
                command = { title: 'Post-Action', command: 'editor.action.triggerSuggest' }
            }
            const cmd = new CmdEnvSuggestion(
                `\\${result[1]}`,
                this.whichPackageProvidesCommand(result[1]),
                { name: result[1], args: this.getArgsFromRegResult(result) },
                vscode.CompletionItemKind.Function,
                { documentation, insertText, filterText, command}
            )
            cmds.push(cmd)
            commandNameDuplicationDetector.add(result[1])
        }

        const newCommandReg = /\\(?:(?:(?:re|provide)?(?:new)?command)|(?:DeclarePairedDelimiter(?:X|XPP)?)|DeclareMathOperator)\*?{?\\(\w+)}?(?:\[([1-9])\])?/g
        while (true) {
            const result = newCommandReg.exec(content)
            if (result === null) {
                break
            }
            if (commandNameDuplicationDetector.has(result[1])) {
                continue
            }

            let tabStops = ''
            let args = ''
            if (result[2]) {
                const numArgs = parseInt(result[2])
                for (let i = 1; i <= numArgs; ++i) {
                    tabStops += '{${' + i + '}}'
                    args += '{}'
                }
            }

            const documentation = '`' + result[1] + '`'
            const insertText = new vscode.SnippetString(result[1] + tabStops)
            const filterText = result[1]
            const cmd = new CmdEnvSuggestion(
                `\\${result[1]}`,
                'user-defined',
                {name: result[1], args},
                vscode.CompletionItemKind.Function,
                { documentation, insertText, filterText }
            )
            cmds.push(cmd)
            commandNameDuplicationDetector.add(result[1])

            this.definedCmds.set(result[1], {
                file,
                location: new vscode.Location(
                    vscode.Uri.file(file),
                    new vscode.Position(content.substring(0, result.index).split('\n').length - 1, 0))
            })
        }

        return cmds
    }

    private getTabStopsFromRegResult(result: RegExpExecArray): string {
        let text = ''

        if (result[2]) {
            text += '{${1}}'
        }
        if (result[3]) {
            text += '{${2}}'
        }
        if (result[4]) {
            text += '{${3}}'
        }
        return text
    }

    private getArgsFromRegResult(result: RegExpExecArray): string {
        return '{}'.repeat(result.length - 1)
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
