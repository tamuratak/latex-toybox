import * as vscode from 'vscode'
import * as path from 'node:path'
import * as micromatch from 'micromatch'

import type { IProvider } from './interface.js'
import { stripCommentsAndVerbatim } from '../../utils/strip.js'
import type { Manager } from '../../components/manager.js'
import type { Logger } from '../../components/logger.js'
import { readDir, statPath } from '../../lib/lwfs/lwfs.js'
import { FileKind, FolderKind } from './completionkind.js'


const ignoreFiles = ['**/.vscode', '**/.vscodeignore', '**/.gitignore']

abstract class AbstractInput implements IProvider {
    graphicsPath: string[] = []

    constructor(protected readonly extension: {
        readonly logger: Logger,
        readonly manager: Manager
    }) { }

    /**
     * Compute the base directory for file completion
     *
     * @param currentFile current file path
     * @param importFromDir `From` argument of the import command
     * @param command The command which triggered the completion
     */
    abstract getBaseDir(currentFile: string, importFromDir: string, command: string): string[]

    /**
     * Do we only list directories?
     *
     * @param importFromDir `From` argument of the import command
     */
    abstract provideDirOnly(importFromDir: string): boolean


    /**
     * Filter a list of completion paths
     *
     * @param document The textDocumt from which the filtering was launch
     * @param files The list of files to filter
     * @param baseDir The base directory to resolve paths from
     */
    private filterIgnoredFiles(document: vscode.TextDocument, files: [string, vscode.FileType][], baseDir: string) {
        const excludeGlob = (Object.keys(vscode.workspace.getConfiguration('files', null).get('exclude') || {})).concat(vscode.workspace.getConfiguration('latex-toybox', document.uri).get('intellisense.file.exclude') || [] ).concat(ignoreFiles)
        return files.filter(([file]) => {
            const filePath = path.resolve(baseDir, file)
            return !micromatch.isMatch(filePath, excludeGlob, {basename: true})
        })
    }

    /**
     * Set the graphics path
     *
     * @param content the content to be parsed for graphicspath
     */
    setGraphicsPath(content: string) {
        const regex = /\\graphicspath{[\s\n]*((?:{[^{}]*}[\s\n]*)*)}/g
        const noVerbContent = stripCommentsAndVerbatim(content)
        let result: string[] | null
        do {
            result = regex.exec(noVerbContent)
            if (result) {
                for (const dir of result[1].split(/\{|\}/).filter(s => s.replace(/^\s*$/, ''))) {
                    if (this.graphicsPath.includes(dir)) {
                        continue
                    }
                    this.graphicsPath.push(dir)
                }
            }
        } while (result)
    }

    reset() {
        this.graphicsPath = []
    }

    provideFrom(result: RegExpMatchArray, args: {document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext}) {
        const command = result[1]
        const payload = [...result.slice(2).reverse()]
        return this.provide(args.document, args.position, command, payload)
    }

    /**
     * Provide file name intellisense
     *
     * @param payload an array of string
     *      payload[0]: The already typed path
     *      payload[1]: The path from which completion is triggered, may be empty
     */
    private async provide(document: vscode.TextDocument, position: vscode.Position, command: string, payload: string[]) {
        const currentFile = document.fileName
        const typedFolder = payload[0]
        const importFromDir = payload[1]
        const startPos = Math.max(document.lineAt(position).text.lastIndexOf('{', position.character), document.lineAt(position).text.lastIndexOf('/', position.character))
        const range: vscode.Range | undefined = startPos >= 0 ? new vscode.Range(position.line, startPos + 1, position.line, position.character) : undefined
        const baseDir: string[] = this.getBaseDir(currentFile, importFromDir, command)
        const provideDirOnly: boolean = this.provideDirOnly(importFromDir)

        const suggestions: vscode.CompletionItem[] = []
        for (let dir of baseDir) {
            if (typedFolder !== '') {
                let currentFolder = typedFolder
                if (! typedFolder.endsWith('/')) {
                    currentFolder = path.dirname(typedFolder)
                }
                dir = path.resolve(dir, currentFolder)
            }
            try {
                let files = await readDir(vscode.Uri.file(dir))
                files = this.filterIgnoredFiles(document, files, dir)

                for (let [file] of files) {
                    const filePath = path.resolve(dir, file)
                    if (dir === '/') {
                        // Keep the leading '/' to have an absolute path
                        file = '/' + file
                    }
                    const fileType = await statPath(filePath)
                    if (fileType.type === vscode.FileType.Directory) {
                        const item = new vscode.CompletionItem(`${file}/`, FolderKind)
                        if (range) {
                            item.range = range
                        }
                        item.command = { title: 'Post-Action', command: 'editor.action.triggerSuggest' }
                        item.detail = dir
                        suggestions.push(item)
                    } else if (! provideDirOnly) {
                        const item = new vscode.CompletionItem(file, FileKind)
                        const preview = vscode.workspace.getConfiguration('latex-toybox').get('intellisense.includegraphics.preview.enabled') as boolean
                        if (preview && ['includegraphics', 'includesvg'].includes(command)) {
                            item.documentation = filePath
                        }
                        if (range) {
                            item.range = range
                        }
                        item.detail = dir
                        suggestions.push(item)
                    }
                }
            } catch (_) {}
        }
        return suggestions
    }
}

export class Input extends AbstractInput {

    constructor(extension: ConstructorParameters<typeof AbstractInput>[0]) {
        super(extension)
    }

    provideDirOnly(_importFromDir: string): boolean {
        return false
    }

    getBaseDir(currentFile: string, _importFromDir: string, command: string): string[] {
        let baseDir: string[] = []
        if (this.extension.manager.rootDir === undefined) {
            this.extension.logger.info(`No root dir can be found. The current root file should be undefined, is ${this.extension.manager.rootFile}. How did you get here?`)
            return []
        }
        // If there is no root, 'root relative' and 'both' should fall back to 'file relative'
        const rootDir = this.extension.manager.rootDir
        if (['includegraphics', 'includesvg'].includes(command) && this.graphicsPath.length > 0) {
            baseDir = this.graphicsPath.map(dir => path.join(rootDir, dir))
        } else {
            const baseConfig = vscode.workspace.getConfiguration('latex-toybox', vscode.Uri.file(currentFile)).get('intellisense.file.base')
            const baseDirCurrentFile = path.dirname(currentFile)
            switch (baseConfig) {
                case 'root relative': {
                    baseDir = [rootDir]
                    break
                }
                case 'file relative': {
                    baseDir = [baseDirCurrentFile]
                    break
                }
                case 'both': {
                    if (baseDirCurrentFile !== rootDir) {
                        baseDir = [baseDirCurrentFile, rootDir]
                    } else {
                        baseDir = [rootDir]
                    }
                    break
                }
                default:
            }
        }
        return baseDir
    }
}

export class Import extends AbstractInput {

    constructor(extension: ConstructorParameters<typeof AbstractInput>[0]) {
        super(extension)
    }

    provideDirOnly(importFromDir: string): boolean {
        return (!importFromDir)
    }

    getBaseDir(_currentFile: string, importFromDir: string, _command: string): string[] {
        if (importFromDir) {
            return [importFromDir]
        } else {
            return ['/']
        }
    }
}


export class SubImport extends AbstractInput {

    constructor(extension: ConstructorParameters<typeof AbstractInput>[0]) {
        super(extension)
    }

    provideDirOnly(importFromDir: string): boolean {
        return (!importFromDir)
    }


    getBaseDir(currentFile: string, importFromDir: string, _command: string): string[] {
        if (importFromDir) {
            return [path.join(path.dirname(currentFile), importFromDir)]
        } else {
            return [path.dirname(currentFile)]
        }
    }
}
