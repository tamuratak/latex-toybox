import * as vscode from 'vscode'

import type {IProvider} from './interface'
import {CommandSignatureDuplicationDetector} from './commandlib/commandfinder'
import {CmdEnvSuggestion, splitSignatureString} from './command'
import type {CompleterLocator, ExtensionRootLocator, LoggerLocator, LwfsLocator, ManagerLocator} from '../../interfaces'


type DataEnvsJsonType = typeof import('../../../data/environments.json')

export interface EnvItemEntry {
    name: string, // Name of the environment, what comes inside \begin{...}
    snippet?: string, // To be inserted after \begin{..}
    package?: string, // The package providing the environment
    detail?: string
}

function isEnvItemEntry(obj: any): obj is EnvItemEntry {
    return (typeof obj.name === 'string')
}

export enum EnvSnippetType { AsName, AsCommand, ForBegin, }

interface IExtension extends
    ExtensionRootLocator,
    CompleterLocator,
    LoggerLocator,
    LwfsLocator,
    ManagerLocator { }

export class Environment implements IProvider {
    private readonly extension: IExtension
    private defaultEnvsAsName: CmdEnvSuggestion[] = []
    private defaultEnvsAsCommand: CmdEnvSuggestion[] = []
    private defaultEnvsForBegin: CmdEnvSuggestion[] = []
    private readonly packageEnvsAsName = new Map<string, CmdEnvSuggestion[]>()
    private readonly packageEnvsAsCommand = new Map<string, CmdEnvSuggestion[]>()
    private readonly packageEnvsForBegin= new Map<string, CmdEnvSuggestion[]>()

    constructor(extension: IExtension) {
        this.extension = extension
        void this.load()
    }

    private async load() {
        const packageDirUri = vscode.Uri.file(`${this.extension.extensionRoot}/data/packages/`)
        const files = await vscode.workspace.fs.readDirectory(packageDirUri)
        const pkgAndEnvs: { pkg: string, envs: { [key: string]: EnvItemEntry } }[] = []
        for (const file of files) {
            const fileName = file[0]
            const match = /(.*)_env.json/.exec(fileName)
            if (match) {
                const pkg = match[1]
                const filePathUri = vscode.Uri.joinPath(packageDirUri, fileName)
                try {
                    const content = await this.extension.lwfs.readFile(filePathUri)
                    const envs: {[key: string]: EnvItemEntry} = JSON.parse(content) as DataEnvsJsonType
                    Object.keys(envs).forEach(key => {
                        if (! isEnvItemEntry(envs[key])) {
                            this.extension.logger.addLogMessage(`Cannot parse intellisense file: ${filePathUri}`)
                            this.extension.logger.addLogMessage(`Missing field in entry: "${key}": ${JSON.stringify(envs[key])}`)
                            delete envs[key]
                        }
                    })
                    pkgAndEnvs.push({pkg, envs})
                } catch (e) {
                    this.extension.logger.addLogMessage(`Cannot parse intellisense file: ${filePathUri}`)
                }
            }
        }

        [EnvSnippetType.AsCommand, EnvSnippetType.ForBegin, EnvSnippetType.AsName].forEach((type) => {
            pkgAndEnvs.forEach((item) => {
                if (!item) {
                    return
                }
                const {pkg, envs} = item
                const packageEnvs = this.getPackageEnvs(type)
                const newEntry: CmdEnvSuggestion[] = []
                Object.keys(envs).forEach(key => {
                    newEntry.push(this.entryEnvToCompletion(key, envs[key], type))
                })
                packageEnvs.set(pkg, newEntry)
                return
            })
        })

    }

    initialize(envs: {[key: string]: EnvItemEntry}) {
        this.defaultEnvsAsCommand = []
        this.defaultEnvsForBegin = []
        this.defaultEnvsAsName = []
        Object.keys(envs).forEach(key => {
           this.defaultEnvsAsCommand.push(this.entryEnvToCompletion(key, envs[key], EnvSnippetType.AsCommand))
           this.defaultEnvsForBegin.push(this.entryEnvToCompletion(key, envs[key], EnvSnippetType.ForBegin))
           this.defaultEnvsAsName.push(this.entryEnvToCompletion(key, envs[key], EnvSnippetType.AsName))
        })
    }

    /**
     * This function is called by Command.initialize with type=EnvSnippetType.AsCommand
     * to build a `\envname` command for every default environment.
     */
    getDefaultEnvs(type: EnvSnippetType): CmdEnvSuggestion[] {
        switch (type) {
            case EnvSnippetType.AsName:
                return this.defaultEnvsAsName
            case EnvSnippetType.AsCommand:
                return this.defaultEnvsAsCommand
            case EnvSnippetType.ForBegin:
                return this.defaultEnvsForBegin
            default:
                return []
        }
    }

    private getPackageEnvs(type: EnvSnippetType): Map<string, CmdEnvSuggestion[]> {
        switch (type) {
            case EnvSnippetType.AsName:
                return this.packageEnvsAsName
            case EnvSnippetType.AsCommand:
                return this.packageEnvsAsCommand
            case EnvSnippetType.ForBegin:
                return this.packageEnvsForBegin
            default:
                return new Map<string, CmdEnvSuggestion[]>()
        }
    }

    provideFrom(
        _result: RegExpMatchArray,
        args: {document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext}
    ) {
        const payload = {document: args.document, position: args.position}
        return this.provide(payload)
    }

    private provide(args: {document: vscode.TextDocument, position: vscode.Position}): vscode.CompletionItem[] {
        if (vscode.window.activeTextEditor === undefined) {
            return []
        }
        let snippetType: EnvSnippetType = EnvSnippetType.ForBegin
        if (vscode.window.activeTextEditor.selections.length > 1 || args.document.lineAt(args.position.line).text.slice(args.position.character).match(/[a-zA-Z*]*}/)) {
            snippetType = EnvSnippetType.AsName
        }

        // Extract cached envs and add to default ones
        const suggestions: vscode.CompletionItem[] = Array.from(this.getDefaultEnvs(snippetType))
        const envList: string[] = this.getDefaultEnvs(snippetType).map(env => env.label)

        // Insert package environments
        const configuration = vscode.workspace.getConfiguration('latex-workshop')
        if (configuration.get('intellisense.package.enabled')) {
            const extraPackages = this.extension.completer.command.getExtraPkgs(args.document.languageId)
            if (extraPackages) {
                extraPackages.forEach(pkg => {
                    this.getEnvFromPkg(pkg, snippetType).forEach(env => {
                        if (!envList.includes(env.label)) {
                            suggestions.push(env)
                            envList.push(env.label)
                        }
                    })
                })
            }
            this.extension.manager.getIncludedTeX().forEach(tex => {
                const pkgs = this.extension.manager.getCachedContent(tex)?.element.package
                if (pkgs !== undefined) {
                    pkgs.forEach(pkg => {
                        this.getEnvFromPkg(pkg, snippetType).forEach(env => {
                            if (!envList.includes(env.label)) {
                                suggestions.push(env)
                                envList.push(env.label)
                            }
                        })
                    })
                }
            })
        }

        // Insert environments defined in tex
        this.extension.manager.getIncludedTeX().forEach(cachedFile => {
            const cachedEnvs = this.extension.manager.getCachedContent(cachedFile)?.element.environment
            if (cachedEnvs !== undefined) {
                cachedEnvs.forEach(env => {
                    if (! envList.includes(env.label)) {
                        if (snippetType === EnvSnippetType.ForBegin) {
                            env.insertText = new vscode.SnippetString(`${env.label}}\n\t$0\n\\end{${env.label}}`)
                        } else {
                            env.insertText = env.label
                        }
                        suggestions.push(env)
                        envList.push(env.label)
                    }
                })
            }
        })

        return suggestions
    }

    /**
     * Environments can be inserted using `\envname`.
     * This function is called by Command.provide to compute these commands for every package in use.
     */
    provideEnvsAsCommandInPkg(pkg: string, suggestions: vscode.CompletionItem[], cmdDuplicationDetector: CommandSignatureDuplicationDetector) {
        const configuration = vscode.workspace.getConfiguration('latex-workshop')
        const useOptionalArgsEntries = configuration.get('intellisense.optionalArgsEntries.enabled')

        if (! configuration.get('intellisense.package.env.enabled')) {
            return
        }

        // No environment defined in package
        const entry = this.packageEnvsAsCommand.get(pkg)
        if (!entry || entry.length === 0) {
            return
        }

        // Insert env snippets
        entry.forEach(env => {
            if (!useOptionalArgsEntries && env.hasOptionalArgs()) {
                return
            }
            if (!cmdDuplicationDetector.has(env)) {
                suggestions.push(env)
                cmdDuplicationDetector.add(env)
            }
        })
    }

    private getEnvFromPkg(pkg: string, type: EnvSnippetType): CmdEnvSuggestion[] {
        const packageEnvs = this.getPackageEnvs(type)
        return packageEnvs.get(pkg) || []
    }

    private entryEnvToCompletion(itemKey: string, item: EnvItemEntry, type: EnvSnippetType): CmdEnvSuggestion {
        const label = item.detail ? item.detail : item.name
        const suggestion = new CmdEnvSuggestion(item.name, 'latex', splitSignatureString(itemKey), vscode.CompletionItemKind.Module)
        suggestion.detail = `Insert environment ${item.name}.`
        suggestion.documentation = item.name
        if (item.package) {
            suggestion.documentation += '\n' + `Package: ${item.package}`
        }
        suggestion.sortText = label.replace(/^[a-zA-Z]/, c => {
            const n = c.match(/[a-z]/) ? c.toUpperCase().charCodeAt(0): c.toLowerCase().charCodeAt(0)
            return n !== undefined ? n.toString(16): c
        })

        if (type === EnvSnippetType.AsName) {
            return suggestion
        } else {
            if (type === EnvSnippetType.AsCommand) {
                suggestion.kind = vscode.CompletionItemKind.Snippet
            }
            const configuration = vscode.workspace.getConfiguration('latex-workshop')
            const useTabStops = configuration.get('intellisense.useTabStops.enabled')
            const prefix = (type === EnvSnippetType.ForBegin) ? '' : 'begin{'
            let snippet: string = item.snippet ? item.snippet : ''
            if (item.snippet) {
                if (useTabStops) {
                    snippet = item.snippet.replace(/\$\{(\d+):[^}]*\}/g, '$${$1}')
                }
            }
            if (snippet.match(/\$\{?0\}?/)) {
                snippet = snippet.replace(/\$\{?0\}?/, '$${0:$${TM_SELECTED_TEXT}}')
                snippet += '\n'
            } else {
                snippet += '\n\t${0:${TM_SELECTED_TEXT}}\n'
            }
            if (item.detail) {
                suggestion.label = item.detail
            }
            suggestion.filterText = itemKey
            suggestion.insertText = new vscode.SnippetString(`${prefix}${item.name}}${snippet}\\end{${item.name}}`)
            return suggestion
        }
    }

}
