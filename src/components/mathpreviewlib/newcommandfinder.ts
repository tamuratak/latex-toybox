import * as vscode from 'vscode'
import { latexParser } from 'latex-utensils'
import { isNewCommand, NewCommand } from '../../utils/newcommand.js'
import * as path from 'node:path'

import { readFilePathGracefully } from '../../lib/lwfs/lwfs.js'
import { getDirtyContent } from '../../utils/getdirtycontent.js'
import type { Logger } from '../logger.js'
import type { Manager } from '../manager.js'
import type { UtensilsParser } from '../utensilsparser.js'


export class NewCommandFinder {

    constructor(private readonly extension: {
        readonly logger: Logger,
        readonly manager: Manager,
        readonly utensilsParser: UtensilsParser
    }) { }

    private postProcessNewCommands(commands: string): string {
        return commands.replace(/\\providecommand/g, '\\newcommand')
                       .replace(/\\newcommand\*/g, '\\newcommand')
                       .replace(/\\renewcommand\*/g, '\\renewcommand')
                       .replace(/\\DeclarePairedDelimiter{(\\[a-zA-Z]+)}{([^{}]*)}{([^{}]*)}/g, '\\newcommand{$1}[2][]{#1$2 #2 #1$3}')
    }

    private async loadNewCommandFromConfigFile(newCommandFile: string) {
        let commandsString: string | undefined = ''
        if (newCommandFile === '') {
            return commandsString
        }
        let newCommandFileAbs: string
        if (path.isAbsolute(newCommandFile)) {
            newCommandFileAbs = newCommandFile
        } else {
            const rootDir = this.extension.manager.rootDir
            if (rootDir === undefined) {
                this.extension.logger.error(`Cannot identify the absolute path of new command file ${newCommandFile} without root file.`)
                return ''
            }
            newCommandFileAbs = path.join(rootDir, newCommandFile)
        }
        commandsString = await readFilePathGracefully(newCommandFileAbs)
        if (commandsString === undefined) {
            this.extension.logger.error(`Cannot read file ${newCommandFileAbs}`)
            return ''
        }
        commandsString = commandsString.replace(/^\s*$/gm, '')
        commandsString = this.postProcessNewCommands(commandsString)
        return commandsString
    }

    async findProjectNewCommand(ctoken?: vscode.CancellationToken): Promise<string> {
        const configuration = vscode.workspace.getConfiguration('latex-toybox')
        const newCommandFile = configuration.get('hover.preview.newcommand.newcommandFile') as string
        let commandsInConfigFile = ''
        if (newCommandFile !== '') {
            commandsInConfigFile = await this.loadNewCommandFromConfigFile(newCommandFile)
        }

        if (!configuration.get('hover.preview.newcommand.parseTeXFile.enabled')) {
            return commandsInConfigFile
        }
        let commands: string[] = []
        let exceeded = false
        setTimeout( () => { exceeded = true }, 5000)
        for (const tex of this.extension.manager.getIncludedTeX()) {
            if (ctoken?.isCancellationRequested) {
                return ''
            }
            if (exceeded) {
                this.extension.logger.error('Timeout error when parsing preambles in findProjectNewCommand.')
                throw new Error('Timeout Error in findProjectNewCommand')
            }
            const cache = this.extension.manager.getCachedContent(tex)
            if (cache === undefined) {
                continue
            }
            const {content} = await getDirtyContent(tex)
            if (content === undefined) {
                continue
            }
            commands = commands.concat(await this.findNewCommand(content))
        }
        return commandsInConfigFile + '\n' + this.postProcessNewCommands(commands.join(''))
    }

    async findNewCommand(content: string): Promise<string[]> {
        const commands: string[] = []
        try {
            const ast = await this.extension.utensilsParser.parseLatexPreamble(content)
            for (const node of ast.content) {
                if ((isNewCommand(node) || latexParser.isDefCommand(node)) && node.args.length > 0) {
                    node.name = node.name.replace(/\*$/, '') as NewCommand['name']
                    const s = latexParser.stringify(node)
                    commands.push(s)
                } else if (latexParser.isCommand(node) && node.name === 'DeclarePairedDelimiter' && node.args.length === 3) {
                    const name = latexParser.stringify(node.args[0])
                    const leftDelim = latexParser.stringify(node.args[1]).slice(1, -1)
                    const rightDelim = latexParser.stringify(node.args[2]).slice(1, -1)
                    const s = `\\newcommand${name}[2][]{#1${leftDelim} #2 #1${rightDelim}}`
                    commands.push(s)
                }
            }
            return commands
        } catch (e) {
            return []
        }
    }

}
