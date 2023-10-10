import {latexParser} from 'latex-utensils'


export type NewCommand = {
    kind: 'command',
    name: 'renewcommand|newcommand|providecommand|DeclareMathOperator|renewcommand*|newcommand*|providecommand*|DeclareMathOperator*',
    args: (latexParser.OptionalArg | latexParser.Group)[],
    location: latexParser.Location
}

export function isNewCommand(node: latexParser.Node | undefined): node is NewCommand {
    const regex = /^(renewcommand|newcommand|providecommand|DeclareMathOperator)(\*)?$/
    if (latexParser.isCommand(node) && node.name.match(regex)) {
        return true
    }
    return false
}

export type NewEnvironment = {
    kind: 'command',
    name: 'renewenvironment|newenvironment|renewenvironment*|newenvironment*',
    args: (latexParser.OptionalArg | latexParser.Group)[],
    location: latexParser.Location
}

export function isNewEnvironment(node: latexParser.Node | undefined): node is NewEnvironment {
    const regex = /^(renewenvironment|newenvironment)(\*)?$/
    if (latexParser.isCommand(node) && node.name.match(regex)) {
        return true
    }
    return false
}
