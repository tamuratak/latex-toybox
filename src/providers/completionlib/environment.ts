import * as vscode from 'vscode'

import type {IProvider} from './interface.js'
import {CommandNameDuplicationDetector, CommandSignatureDuplicationDetector} from './commandlib/commandlib.js'
import {CmdEnvSuggestion, splitSignatureString} from './command.js'
import * as lwfs from '../../lib/lwfs/lwfs.js'
import { reverseCaseOfFirstCharacterAndConvertToHex } from './utils/sortkey.js'
import type { Logger } from '../../components/logger.js'
import type { Manager } from '../../components/manager.js'
import type { Completer } from '../completion.js'
import { EnvAsCmdKind, EnvKind } from './completionkind.js'
import { inspectCompact } from '../../utils/inspect.js'


type DataEnvsJsonType = typeof import('../../../data/environments.json')

export interface EnvItemEntry {
    readonly name: string, // Name of the environment, what comes inside \begin{...}
    readonly snippet?: string, // To be inserted after \begin{..}
    readonly package?: string, // The package providing the environment
    readonly detail?: string
}

function isEnvItemEntry(obj: EnvItemEntry | undefined) {
    if (obj) {
        return (typeof obj.name === 'string')
    } else {
        return false
    }
}

export enum EnvSnippetType {
    /**
     * \begin{ab|
     */
    AsName,
    /**
     * \|
     */
    AsCommand,
    /**
     * \begin{|
     */
    ForBegin
}

export class Environment implements IProvider {
    private defaultEnvsAsName: CmdEnvSuggestion[] = []
    private defaultEnvsAsCommand: CmdEnvSuggestion[] = []
    private defaultEnvsForBegin: CmdEnvSuggestion[] = []
    private readonly packageEnvsAsName = new Map<string, CmdEnvSuggestion[]>()
    private readonly packageEnvsAsCommand = new Map<string, CmdEnvSuggestion[]>()
    private readonly packageEnvsForBegin= new Map<string, CmdEnvSuggestion[]>()
    readonly readyPromise: Promise<void>

    constructor(private readonly extension: {
        readonly extensionRoot: string,
        readonly completer: Completer,
        readonly logger: Logger,
        readonly manager: Manager
    }) {
        this.readyPromise = new Promise((resolve) => this.load().then(() => resolve()))
    }

    private async load() {
        const packageDirUri = vscode.Uri.file(`${this.extension.extensionRoot}/data/packages/`)
        const files = await vscode.workspace.fs.readDirectory(packageDirUri)
        const pkgAndEnvs: { pkg: string, envs: Record<string, EnvItemEntry> }[] = []
        for (const file of files) {
            const fileName = file[0]
            const match = /(.*)_env.json/.exec(fileName)
            if (match) {
                const pkg = match[1]
                const filePathUri = vscode.Uri.joinPath(packageDirUri, fileName)
                try {
                    const content = await lwfs.readFile(filePathUri)
                    const envs: Record<string, EnvItemEntry> = JSON.parse(content) as DataEnvsJsonType
                    Object.keys(envs).forEach(key => {
                        if (!isEnvItemEntry(envs[key])) {
                            this.extension.logger.info(`Cannot parse intellisense file: ${filePathUri}`)
                            this.extension.logger.info(`Missing field in entry: "${key}": ${inspectCompact(envs[key])}`)
                            delete envs[key]
                        }
                    })
                    pkgAndEnvs.push({pkg, envs})
                } catch (_) {
                    this.extension.logger.info(`Cannot parse intellisense file: ${filePathUri}`)
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

    initialize(envs: Record<string, EnvItemEntry>) {
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
        _: RegExpMatchArray | undefined,
        args: {document: vscode.TextDocument, position: vscode.Position}
    ) {
        return this.provide(args.document, args.position)
    }

    private provide(document: vscode.TextDocument, position: vscode.Position) {
        if (vscode.window.activeTextEditor === undefined) {
            return []
        }
        if (vscode.window.activeTextEditor.selections.length > 1) {
            return []
        }
        let snippetType: EnvSnippetType = EnvSnippetType.ForBegin
        let range: vscode.Range | undefined
        // \begin{|} \end{|} or \begin{ab|}
        if (document.lineAt(position.line).text.slice(position.character).match(/^[a-zA-Z*]*}/)) {
            snippetType = EnvSnippetType.AsName
            range = document.getWordRangeAtPosition(position, /[a-zA-Z*]+/)
        }

        // Extract cached envs and add to default ones
        const suggestions: CmdEnvSuggestion[] = Array.from(this.getDefaultEnvs(snippetType))
        const envList: string[] = this.getDefaultEnvs(snippetType).map(env => env.label)

        // Insert package environments
        const configuration = vscode.workspace.getConfiguration('latex-toybox')
        if (configuration.get('intellisense.package.enabled')) {
            const extraPackages = this.extension.completer.command.getExtraPkgs(document.languageId)
            const pkgsInFile = this.extension.manager.getIncludedTeX().map(tex => {
                const pkg = this.extension.manager.getCachedContent(tex)?.element.package
                return pkg ? Array.from(pkg) : []
            }).flat();
            [...extraPackages, ...pkgsInFile].forEach(pkg => {
                this.getEnvFromPkg(pkg, snippetType).forEach(env => {
                    if (!envList.includes(env.label)) {
                        suggestions.push(env)
                        envList.push(env.label)
                    }
                })
            })
        }

        // Insert environments defined in tex
        this.extension.manager.getIncludedTeX().forEach(cachedFile => {
            const cachedEnvs = this.extension.manager.getCachedContent(cachedFile)?.element.environment
            cachedEnvs?.forEach(env => {
                const newEnv = env.clone()
                if (! envList.includes(env.label)) {
                    if (snippetType === EnvSnippetType.ForBegin) {
                        newEnv.insertText = new vscode.SnippetString(`${env.label}}\n\t$0\n\\end{${env.label}}`)
                    } else {
                        newEnv.insertText = env.label
                    }
                    suggestions.push(newEnv)
                    envList.push(newEnv.label)
                }
            })
        })

        if (snippetType === EnvSnippetType.AsName) {
            return suggestions.map(sugg => {
                if (range) {
                    const newSugg = sugg.clone()
                    newSugg.range = range
                    return newSugg
                } else {
                    return sugg
                }
            })
        } else {
            return suggestions
        }
    }

    provideEnvsAsCommandInFile(filePath: string, cmdDuplicationDetector: CommandNameDuplicationDetector): CmdEnvSuggestion[] {
        const suggestions: CmdEnvSuggestion[] = []
        const cachedEnvs = this.extension.manager.getCachedContent(filePath)?.element.environment
        cachedEnvs?.forEach(env => {
            const newEnv = env.clone()
            newEnv.insertText = new vscode.SnippetString('begin{' + env.label + '}\n\t${0:${TM_SELECTED_TEXT}}\n\\end{' + env.label + '}')
            newEnv.kind = EnvAsCmdKind
            if (!cmdDuplicationDetector.has(newEnv)) {
                suggestions.push(newEnv)
                cmdDuplicationDetector.add(newEnv)
            }
        })
        return suggestions
    }

    /**
     * Environments can be inserted using `\envname`.
     * This function is called by Command.provide to compute these commands for every package in use.
     */
    provideEnvsAsCommandInPkg(pkg: string, cmdDuplicationDetector: CommandSignatureDuplicationDetector): CmdEnvSuggestion[] {
        const suggestions: CmdEnvSuggestion[] = []
        const configuration = vscode.workspace.getConfiguration('latex-toybox')
        const useOptionalArgsEntries = configuration.get('intellisense.optionalArgsEntries.enabled')

        if (! configuration.get('intellisense.package.env.enabled')) {
            return []
        }

        // No environment defined in package
        const entry = this.packageEnvsAsCommand.get(pkg)
        if (!entry || entry.length === 0) {
            return []
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
        return suggestions
    }

    private getEnvFromPkg(pkg: string, type: EnvSnippetType): CmdEnvSuggestion[] {
        const packageEnvs = this.getPackageEnvs(type)
        return packageEnvs.get(pkg) || []
    }

    private entryEnvToCompletion(itemKey: string, item: EnvItemEntry, type: EnvSnippetType): CmdEnvSuggestion {
        const label = item.detail ? item.detail : item.name
        const detail = `Insert environment ${item.name}.`
        let documentation: string
        if (item.package) {
            documentation = item.name + '\n' + `Package: ${item.package}`
        } else {
            documentation = item.name
        }
        const sortText = reverseCaseOfFirstCharacterAndConvertToHex(label)

        if (type === EnvSnippetType.AsName) {
            return new CmdEnvSuggestion(
                item.name,
                'latex',
                splitSignatureString(itemKey),
                EnvKind,
                {detail, documentation, sortText}
            )
        } else {
            let kind: vscode.CompletionItemKind
            if (type === EnvSnippetType.AsCommand) {
                kind = EnvAsCmdKind
            } else {
                kind = EnvKind
            }
            const configuration = vscode.workspace.getConfiguration('latex-toybox')
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
            let sugLabel: string
            if (item.detail) {
                sugLabel = item.detail
            } else {
                sugLabel = item.name
            }
            const filterText = itemKey
            const insertText = new vscode.SnippetString(`${prefix}${item.name}}${snippet}\\end{${item.name}}`)
            return new CmdEnvSuggestion(
                sugLabel,
                'latex',
                splitSignatureString(itemKey),
                kind,
                {detail, documentation, sortText, filterText, insertText}
            )
        }
    }

}
