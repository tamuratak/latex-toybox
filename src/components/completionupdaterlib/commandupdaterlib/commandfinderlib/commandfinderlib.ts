import * as vscode from 'vscode'
import { latexParser } from 'latex-utensils'
import { CmdEnvSuggestion } from '../../../../providers/completionlib/command.js'
import { type CommandNameDuplicationDetector, isTriggerSuggestNeeded } from '../../../../providers/completionlib/commandlib/commandlib.js'
import { CommandKind } from '../../../../providers/completionlib/completionkind.js'


export function getNewComanndFromNode(node: latexParser.Command, commandNameDuplicationDetector: CommandNameDuplicationDetector) {
    const newCommands = ['newcommand', 'renewcommand', 'providecommand', 'DeclareMathOperator', 'DeclarePairedDelimiter', 'DeclarePairedDelimiterX', 'DeclarePairedDelimiterXPP']
    if (newCommands.includes(node.name.replace(/\*$/, '')) && Array.isArray(node.args) && node.args.length > 0) {
        const firstArg = node.args[0].content[0]
        const name = latexParser.isCommand(firstArg) ? firstArg.name : undefined
        if (name === undefined) {
            return
        }
        let tabStops = ''
        let args = ''
        if (latexParser.isOptionalArg(node.args[1])) {
            const secondArg = node.args[1].content[0]
            const numArgs = latexParser.isTextString(secondArg) ? parseInt(secondArg.content) : 1
            for (let i = 1; i <= numArgs; ++i) {
                tabStops += '{${' + i + '}}'
                args += '{}'
            }
        }
        if (!commandNameDuplicationDetector.has(name)) {
            const documentation = '`' + name + '`'
            const insertText = new vscode.SnippetString(name + tabStops)
            const filterText = name
            let command: vscode.Command | undefined
            if (isTriggerSuggestNeeded(name)) {
                command = { title: 'Post-Action', command: 'editor.action.triggerSuggest' }
            }
            const cmd = new CmdEnvSuggestion(
                `\\${name}${args}`,
                'user-defined',
                { name, args },
                CommandKind,
                { documentation, insertText, filterText, command }
            )
            return cmd
        }
    }
    return
}

export function getDefCommandFromNode(node: latexParser.DefCommand, commandNameDuplicationDetector: CommandNameDuplicationDetector) {
    const name = node.token.slice(1)
    if (!commandNameDuplicationDetector.has(name)) {
        const documentation = '`' + name + '`'
        const insertText = new vscode.SnippetString(name + getTabStopsFromNode(node))
        const filterText = name
        let command: vscode.Command | undefined
        if (isTriggerSuggestNeeded(name)) {
            command = { title: 'Post-Action', command: 'editor.action.triggerSuggest' }
        }
        const cmd = new CmdEnvSuggestion(
            `\\${name}`,
            '',
            { name, args: getArgsFromNode(node) },
            CommandKind,
            { documentation, insertText, filterText, command }
        )
        return cmd
    }
    return
}

export function getArgsFromNode(node: latexParser.Node): string {
    return getArgsHelperFromNode(node, (_: number) => { return '' })
}

export function getTabStopsFromNode(node: latexParser.Node): string {
    return getArgsHelperFromNode(node, (i: number) => { return '${' + i + '}' })
}

function getArgsHelperFromNode(node: latexParser.Node, helper: (i: number) => string): string {
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
