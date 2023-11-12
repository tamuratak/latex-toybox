import * as vscode from 'vscode'

import {Environment, EnvSnippetType} from './environment.js'
import type {IProvider, ILwCompletionItem, ICommand} from './interface.js'
import {CommandNameDuplicationDetector, CommandSignatureDuplicationDetector, isTriggerSuggestNeeded} from './commandlib/commandlib.js'
import * as lwfs from '../../lib/lwfs/lwfs.js'
import { reverseCaseOfFirstCharacterAndConvertToHex } from './utils/sortkey.js'
import type { CompletionUpdater } from '../../components/completionupdater.js'
import type { Completer } from '../completion.js'
import type { Logger } from '../../components/logger.js'
import type { Manager } from '../../components/manager.js'
import { CommandKind } from './completionkind.js'
import { inspectCompact } from '../../utils/inspect.js'


type DataUnimathSymbolsJsonType = typeof import('../../../data/unimathsymbols.json')

export interface CmdItemEntry {
    readonly command: string, // frame
    snippet?: string,
    readonly package?: string,
    readonly label?: string, // \\begin{frame} ... \\end{frame}
    readonly detail?: string,
    readonly documentation?: string,
    readonly postAction?: string
}

export interface CmdSignature {
    readonly name: string, // name without leading `\`
    readonly args: string // {} for mandatory args and [] for optional args
}

function isCmdItemEntry(obj: any): obj is CmdItemEntry {
    return (typeof obj.command === 'string') && (typeof obj.snippet === 'string')
}

/**
 * Return {name, args} from a signature string `name` + `args`
 */
export function splitSignatureString(signature: string): CmdSignature {
    const i = signature.search(/[[{]/)
    if (i > -1) {
        return {
            name: signature.substring(0, i),
            args: signature.substring(i, undefined)
        }
    } else {
        return {
            name: signature,
            args: ''
        }
    }
}

export class CmdEnvSuggestion extends vscode.CompletionItem implements ILwCompletionItem {
    readonly command?: vscode.Command
    readonly detail?: string
    readonly documentation?: string
    readonly filterText?: string
    insertText?: string | vscode.SnippetString
    readonly sortText?: string
    readonly label: string
    readonly package: string
    readonly signature: CmdSignature

    constructor(
        label: string,
        pkg: string,
        signature: CmdSignature,
        kind: vscode.CompletionItemKind | undefined,
        args: {
            command?: vscode.Command | undefined,
            documentation?: string | undefined,
            detail?: string | undefined,
            filterText?: string | undefined,
            insertText?: string | vscode.SnippetString | undefined,
            sortText?: string | undefined
        }
    ) {
        super(label, kind)
        this.label = label
        this.package = pkg
        this.signature = signature
        if (args.command) {
            this.command = args.command
        }
        if (args.documentation) {
            this.documentation = args.documentation
        }
        if (args.detail) {
            this.detail = args.detail
        }
        if (args.filterText) {
            this.filterText = args.filterText
        }
        if (args.insertText) {
            this.insertText = args.insertText
        }
        if (args.sortText) {
            this.sortText = args.sortText
        }
    }

    clone(): CmdEnvSuggestion {
        return new CmdEnvSuggestion(
            this.label,
            this.package,
            this.signature,
            this.kind,
            {
                command: this.command,
                documentation: this.documentation,
                detail: this.detail,
                filterText: this.filterText,
                insertText: this.insertText,
                sortText: this.sortText
            }
        )
    }

    /**
     * Return the signature, ie the name + {} for mandatory arguments + [] for optional arguments.
     * The leading backward slash is not part of the signature
     */
    signatureAsString(): string {
        return this.signature.name + this.signature.args
    }

    /**
     * Return the name without the arguments
     * The leading backward slash is not part of the signature
     */
    name(): string {
        return this.signature.name
    }

    hasOptionalArgs(): boolean {
        return this.signature.args.includes('[')
    }
}

export class Command implements IProvider, ICommand {

    private readonly defaultCmds: CmdEnvSuggestion[] = []
    private readonly defaultSymbols: CmdEnvSuggestion[] = []
    private readonly packageCmds = new Map<string, CmdEnvSuggestion[]>()
    readonly readyPromise: Promise<void>

    constructor(
        private readonly extension: {
            readonly extensionRoot: string,
            readonly completer: Completer,
            readonly completionUpdater: CompletionUpdater,
            readonly logger: Logger,
            readonly manager: Manager
        },
        private readonly environment: Environment
    ) {
        this.readyPromise = new Promise((resolve) => this.load().then(() => resolve()))
    }

    private async load() {
        const configuration = vscode.workspace.getConfiguration('latex-toybox')
        const packageDirUri = vscode.Uri.file(`${this.extension.extensionRoot}/data/packages/`)
        const files = await vscode.workspace.fs.readDirectory(packageDirUri)
        for (const file of files) {
            const fileName = file[0]
            const match = /(.*)_cmd.json/.exec(fileName)
            if (match) {
                const pkg = match[1]
                const filePathUri = vscode.Uri.joinPath(packageDirUri, fileName)
                const pkgEntry: CmdEnvSuggestion[] = []
                if (filePathUri !== undefined) {
                    try {
                        const content = await lwfs.readFile(filePathUri)
                        const cmds = JSON.parse(content) as {[key: string]: CmdItemEntry}
                        Object.keys(cmds).forEach(key => {
                            if (isCmdItemEntry(cmds[key])) {
                                pkgEntry.push(this.entryCmdToCompletion(key, cmds[key]))
                            } else {
                                this.extension.logger.info(`Cannot parse intellisense file: ${filePathUri}`)
                                this.extension.logger.info(`Missing field in entry: "${key}": ${inspectCompact(cmds[key])}`)
                            }
                        })
                    } catch (e) {
                        this.extension.logger.error(`Cannot parse intellisense file: ${filePathUri}`)
                        this.extension.logger.logError(e)
                    }
                }
                this.packageCmds.set(pkg, pkgEntry)
            }
        }
        if (configuration.get('intellisense.unimathsymbols.enabled')) {
            const content = await lwfs.readFilePath(`${this.extension.extensionRoot}/data/unimathsymbols.json`)
            const symbols: { [key: string]: CmdItemEntry } = JSON.parse(content) as DataUnimathSymbolsJsonType
            Object.keys(symbols).forEach(key => {
                this.defaultSymbols.push(this.entryCmdToCompletion(key, symbols[key]))
            })
        }
    }

    initialize(defaultCmds: {[key: string]: CmdItemEntry}) {
        const snippetReplacements = vscode.workspace.getConfiguration('latex-toybox').get('intellisense.commandsJSON.replace') as {[key: string]: string}

        // Initialize default commands and `latex-mathsymbols`
        Object.keys(defaultCmds).forEach(key => {
            if (key in snippetReplacements) {
                const action = snippetReplacements[key]
                if (action === '') {
                    return
                }
                defaultCmds[key].snippet = action
            }
            this.defaultCmds.push(this.entryCmdToCompletion(key, defaultCmds[key]))
        })

        // Initialize default env begin-end pairs
        this.environment.getDefaultEnvs(EnvSnippetType.AsCommand).forEach(cmd => {
            this.defaultCmds.push(cmd)
        })
    }

    get definedCmds() {
        return this.extension.completionUpdater.definedCmds
    }

    provideFrom(result: RegExpMatchArray, args: {document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext}) {
        const suggestions = this.provide(args.document.languageId, args.document, args.position)
        // Commands ending with (, { or [ are not filtered properly by vscode intellisense. So we do it by hand.
        if (result[0].match(/[({[]$/)) {
            const exactSuggestion = suggestions.filter(entry => entry.label === result[0])
            if (exactSuggestion.length > 0) {
                return exactSuggestion
            }
        }
        return suggestions
    }

    provide(languageId: string, document?: vscode.TextDocument, position?: vscode.Position): ILwCompletionItem[] {
        const configuration = vscode.workspace.getConfiguration('latex-toybox')
        const useOptionalArgsEntries = configuration.get('intellisense.optionalArgsEntries.enabled')
        let range: vscode.Range | undefined = undefined
        if (document && position) {
            const startPos = document.lineAt(position).text.lastIndexOf('\\', position.character - 1)
            if (startPos >= 0) {
                range = new vscode.Range(position.line, startPos + 1, position.line, position.character)
            }
        }
        const suggestions: CmdEnvSuggestion[] = []
        const cmdDuplicationDetector = new CommandSignatureDuplicationDetector()
        // Insert default commands
        this.defaultCmds.forEach(cmd => {
            if (!useOptionalArgsEntries && cmd.hasOptionalArgs()) {
                return
            }
            if (range) {
                cmd.range = range
            }
            suggestions.push(cmd)
            cmdDuplicationDetector.add(cmd)
        })

        // Insert unimathsymbols
        if (configuration.get('intellisense.unimathsymbols.enabled')) {
            this.defaultSymbols.forEach(symbol => {
                suggestions.push(symbol)
                cmdDuplicationDetector.add(symbol)
            })
        }

        // Insert commands from packages
        if ((configuration.get('intellisense.package.enabled'))) {
            const extraPackages = this.extension.completer.command.getExtraPkgs(languageId)
            if (extraPackages) {
                extraPackages.forEach(pkg => {
                    suggestions.push(...this.provideCmdInPkg(pkg, cmdDuplicationDetector))
                    suggestions.push(...this.environment.provideEnvsAsCommandInPkg(pkg, cmdDuplicationDetector))
                })
            }
            this.extension.manager.getIncludedTeX().forEach(tex => {
                const pkgs = this.extension.manager.getCachedContent(tex)?.element.package
                pkgs?.forEach(pkg => {
                    suggestions.push(...this.provideCmdInPkg(pkg, cmdDuplicationDetector))
                    suggestions.push(...this.environment.provideEnvsAsCommandInPkg(pkg, cmdDuplicationDetector))
                })
            })
        }

        // Start working on commands in tex. To avoid over populating suggestions, we do not include
        // user defined commands, whose name matches a default command or one provided by a package
        const commandNameDuplicationDetector = new CommandNameDuplicationDetector(suggestions)
        this.extension.manager.getIncludedTeX().forEach(tex => {
            const cmds = this.provideCmdsInFile(tex, commandNameDuplicationDetector, range)
            suggestions.push(...cmds)
            const envCmds = this.environment.provideEnvsAsCommandInFile(tex, commandNameDuplicationDetector)
            suggestions.push(...envCmds)
        })

        return suggestions
    }

    private provideCmdsInFile(
        filePath: string,
        commandNameDuplicationDetector: CommandNameDuplicationDetector,
        range: vscode.Range | undefined
    ) {
        const suggestions: CmdEnvSuggestion[] = []
        const cmds = this.extension.manager.getCachedContent(filePath)?.element.command
        cmds?.forEach(cmd => {
            if (!commandNameDuplicationDetector.has(cmd)) {
                if (range) {
                    cmd.range = range
                }
                suggestions.push(cmd)
                commandNameDuplicationDetector.add(cmd)
            }
        })
        return suggestions
    }

    getExtraPkgs(languageId: string): string[] {
        const configuration = vscode.workspace.getConfiguration('latex-toybox')
        const extraPackages = Array.from(configuration.get<string[]>('intellisense.package.extra', []))
        if (languageId === 'latex-expl3') {
            extraPackages.push('latex-document')
            extraPackages.push('expl3')
        } else if (languageId === 'latex') {
            extraPackages.push('latex-document')
        }
        return extraPackages
    }

    private entryCmdToCompletion(itemKey: string, item: CmdItemEntry): CmdEnvSuggestion {
        const configuration = vscode.workspace.getConfiguration('latex-toybox')
        const useTabStops = configuration.get('intellisense.useTabStops.enabled')
        const backslash = item.command.startsWith(' ') ? '' : '\\'
        const label = item.label ? `${item.label}` : `${backslash}${item.command}`

        let insertText: string | vscode.SnippetString
        if (item.snippet) {
            if (useTabStops) {
                item.snippet = item.snippet.replace(/\$\{(\d+):[^$}]*\}/g, '$${$1}')
            }
            // Wrap the selected text when there is a single placeholder
            if (! (item.snippet.match(/\$\{?2/) || (item.snippet.match(/\$\{?0/) && item.snippet.match(/\$\{?1/)))) {
                item.snippet = item.snippet.replace(/\$1|\$\{1\}/, '$${1:$${TM_SELECTED_TEXT}}').replace(/\$\{1:([^$}]+)\}/, '$${1:$${TM_SELECTED_TEXT:$1}}')
            }
            insertText = new vscode.SnippetString(item.snippet)
        } else {
            insertText = item.command
        }
        const filterText = itemKey
        const detail = item.detail
        const documentation = item.documentation ? item.documentation : '`' + item.command + '`'
        const sortText = reverseCaseOfFirstCharacterAndConvertToHex(item.command)
        let command: vscode.Command | undefined
        if (item.postAction) {
            command = { title: 'Post-Action', command: item.postAction }
        } else if (isTriggerSuggestNeeded(item.command)) {
            // Automatically trigger completion if the command is for citation, filename, reference or glossary
            command = { title: 'Post-Action', command: 'editor.action.triggerSuggest' }
        }
        const suggestion = new CmdEnvSuggestion(
            label,
            'latex',
            splitSignatureString(itemKey),
            CommandKind,
            { insertText, filterText, documentation, detail, sortText, command }
        )
        return suggestion
    }

    provideCmdInPkg(pkg: string, cmdDuplicationDetector: CommandSignatureDuplicationDetector): CmdEnvSuggestion[] {
        const suggestions: CmdEnvSuggestion[] = []
        const configuration = vscode.workspace.getConfiguration('latex-toybox')
        const useOptionalArgsEntries = configuration.get('intellisense.optionalArgsEntries.enabled')

        // No package command defined
        const pkgEntry = this.packageCmds.get(pkg)
        if (!pkgEntry || pkgEntry.length === 0) {
            return []
        }

        // Insert commands
        pkgEntry.forEach(cmd => {
            if (!useOptionalArgsEntries && cmd.hasOptionalArgs()) {
                return
            }
            if (!cmdDuplicationDetector.has(cmd)) {
                suggestions.push(cmd)
                cmdDuplicationDetector.add(cmd)
            }
        })
        return suggestions
    }

}
