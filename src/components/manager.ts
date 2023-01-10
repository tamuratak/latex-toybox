import * as vscode from 'vscode'
import * as os from 'os'
import * as path from 'path'
import * as micromatch from 'micromatch'
import * as utils from '../utils/utils'
import {InputFileRegExp} from '../utils/inputfilepath'

import type {Extension} from '../main'
import * as eventbus from './eventbus'
import type {CmdEnvSuggestion} from '../providers/completer/command'
import type {CiteSuggestion} from '../providers/completer/citation'
import type {GlossarySuggestion} from '../providers/completer/glossary'
import type {IManager} from '../interfaces'

import {PdfWatcher} from './managerlib/pdfwatcher'
import {BibWatcher} from './managerlib/bibwatcher'
import {FinderUtils} from './managerlib/finderutils'
import {PathUtils} from './managerlib/pathutils'

import { LabelDefinitionElement } from '../providers/completer/labeldefinition'
import { existsPath, isLocalUri, isVirtualUri, readFileGracefully, readFilePath, readFilePathGracefully } from '../lib/lwfs/lwfs'
import { ExternalPromise } from '../utils/externalpromise'
import { MutexWithSizedQueue } from '../utils/mutexwithsizedqueue'
import { LwFileWatcher } from './managerlib/lwfilewatcher'


export interface CachedContentEntry {
    /**
     * Completion item and other items for the LaTeX file.
     */
    readonly element: {
        labelDefinition?: LabelDefinitionElement[],
        glossary?: GlossarySuggestion[],
        environment?: CmdEnvSuggestion[],
        bibitem?: CiteSuggestion[],
        command?: CmdEnvSuggestion[],
        package?: Set<string>
    },
    /**
     * The sub-files of the LaTeX file. They should be tex or plain files.
     */
    children: {
        /**
         * The path of the sub-file
         */
        readonly file: string
    }[],
    /**
     * The array of the paths of `.bib` files referenced from the LaTeX file.
     */
    bibs: string[]
}

export const enum BuildEvents {
    never = 'never',
    onSave = 'onSave',
    onFileChange = 'onFileChange'
}

type RootFileType = {
    readonly type: 'filePath',
    readonly filePath: string
} | {
    readonly type: 'uri',
    readonly uri: vscode.Uri
}

export class Manager implements IManager {
    /**
     * The content cache for each LaTeX file.
     */
    private readonly cachedContent = new Map<string, CachedContentEntry>() // key: filePath

    private _localRootFile: string | undefined
    private _rootFileLanguageId: string | undefined
    private _rootFile: RootFileType | undefined

    private readonly extension: Extension
    private readonly lwFileWatcher: LwFileWatcher
    // key is fsPath
    private readonly watchedFiles = new Set<string>()
    private readonly pdfWatcher: PdfWatcher
    private readonly bibWatcher: BibWatcher
    private readonly finderUtils: FinderUtils
    private readonly pathUtils: PathUtils
    private readonly rsweaveExt: string[] = ['.rnw', '.Rnw', '.rtex', '.Rtex', '.snw', '.Snw']
    private readonly jlweaveExt: string[] = ['.jnw', '.jtexw']
    private readonly weaveExt: string[] = []
    #rootFilePromise: ExternalPromise<string | undefined> | undefined
    private readonly findRootMutex = new MutexWithSizedQueue(1)
    private readonly parseFlsMutex = new MutexWithSizedQueue(1)
    private readonly updateCompleterMutex = new MutexWithSizedQueue(1)
    private readonly updateContentEntryMutex = new MutexWithSizedQueue(1)

    constructor(extension: Extension) {
        this.extension = extension
        const configuration = vscode.workspace.getConfiguration('latex-workshop')
        this.weaveExt = this.jlweaveExt.concat(this.rsweaveExt)

        const lwFileWatcher = new LwFileWatcher()
        this.lwFileWatcher = lwFileWatcher
        this.registerListeners(lwFileWatcher)
        this.pdfWatcher = new PdfWatcher(extension, lwFileWatcher)
        this.bibWatcher = new BibWatcher(extension, lwFileWatcher)

        this.finderUtils = new FinderUtils(extension)
        this.pathUtils = new PathUtils(extension)
        this.extension.eventBus.onDidChangeRootFile(() => this.logWatchedFiles())

        let prevTime = 0
        extension.extensionContext.subscriptions.push(
            vscode.workspace.onDidSaveTextDocument((e) => {
                if (!this.isLocalLatexDocument(e)){
                    return
                }
                void this.buildOnSave(e.fileName)
            }),
            vscode.window.onDidChangeActiveTextEditor(async (e) => {
                this.extension.logger.debug(`onDidChangeActiveTextEditor: ${e?.document.uri.toString()}`)
                if (!e || !this.isLocalLatexDocument(e.document)) {
                    return
                }
                await this.findRoot()
            }),
            vscode.workspace.onDidChangeTextDocument(async (e) => {
                if (!this.isLocalLatexDocument(e.document)) {
                    return
                }
                const cache = this.getCachedContent(e.document.fileName)
                if (cache === undefined) {
                    return
                }
                if (configuration.get('intellisense.update.aggressive.enabled')) {
                    const currentTime = Date.now()
                    const iUpdateDelay = configuration.get('intellisense.update.delay', 1000)
                    if (currentTime - prevTime < iUpdateDelay) {
                        return
                    }
                    prevTime = currentTime
                    const fileUri = e.document.uri
                    await this.updateContentEntry(fileUri)
                }
            })
        )

        setTimeout(async () => {
            const editor = vscode.window.visibleTextEditors.find(edt => this.isLocalLatexDocument(edt.document))
            if (editor && !process.env['LATEXWORKSHOP_CI'] && !this.rootFile) {
                await vscode.window.showTextDocument(editor.document, editor.viewColumn)
                return this.findRoot()
            }
            return
        }, 500)

        this.extension.builder.onDidBuild((rootFile) => {
            return this.parseFlsFile(rootFile)
        })

        extension.extensionContext.subscriptions.push(
            new vscode.Disposable(() => this.dispose())
        )

    }

    private dispose() {
        this.lwFileWatcher.dispose()
    }

    getCachedContent(filePath: string): Readonly<CachedContentEntry> | undefined {
        return this.cachedContent.get(filePath)
    }

    /**
     * This method should be private to ensure that only manager can change the cached tree structure.
     */
    private gracefulCachedContent(filePath: string): CachedContentEntry {
        const cache = this.cachedContent.get(filePath)
        if (cache) {
            return cache
        } else {
            const cacheEntry = { element: {}, children: [], bibs: [] }
            this.cachedContent.set(filePath, cacheEntry)
            return cacheEntry
        }
    }

    get cachedFilePaths() {
        return this.cachedContent.keys()
    }

    getFilesWatched() {
        return Array.from(this.watchedFiles)
    }

    /**
     * Returns the output directory developed according to the input tex path
     * and 'latex.outDir' config. If `texPath` is `undefined`, the default root
     * file is used. If there is not root file, returns './'.
     * The returned path always uses `/` even on Windows.
     *
     * @param texPath The path of a LaTeX file.
     */
    getOutDir(texPath?: string) {
        if (texPath === undefined) {
            texPath = this.rootFile
        }
        // rootFile is also undefined
        if (texPath === undefined) {
            return './'
        }

        const configuration = vscode.workspace.getConfiguration('latex-workshop', vscode.Uri.file(texPath))
        const outDir = configuration.get('latex.outDir') as string
        const out = utils.replaceArgumentPlaceholders(texPath, this.extension.builder.tmpDir)(outDir)
        return path.normalize(out).split(path.sep).join('/')
    }

    /**
     * The path of the directory of the root file.
     */
    get rootDir() {
        return this.rootFile ? path.dirname(this.rootFile) : undefined
    }

    /**
     * The path of the root LaTeX file of the current workspace.
     * It is `undefined` before `findRoot` called.
     */
    get rootFile(): string | undefined {
        const ret = this._rootFile
        if (ret) {
            if (ret.type === 'filePath') {
                return ret.filePath
            } else {
                if (ret.uri.scheme === 'file') {
                    return ret.uri.fsPath
                } else {
                    this.extension.logger.info(`The file cannot be used as the root file: ${ret.uri.toString(true)}`)
                    return
                }
            }
        } else {
            return
        }
    }

    set rootFile(root: string | undefined) {
        if (root) {
            this._rootFile = { type: 'filePath', filePath: root }
        } else {
            this._rootFile = undefined
        }
    }

    get rootFilePromise(): Promise<string | undefined> {
        if (this.#rootFilePromise) {
            return this.#rootFilePromise.promise
        } else {
            return Promise.resolve(this.rootFile)
        }
    }

    get rootFileUri(): vscode.Uri | undefined {
        const root = this._rootFile
        if (root) {
            if (root.type === 'filePath') {
                return vscode.Uri.file(root.filePath)
            } else {
                return root.uri
            }
        } else {
            return
        }
    }

    set rootFileUri(root: vscode.Uri | undefined) {
        let rootFile: RootFileType | undefined
        if (root) {
            if (root.scheme === 'file') {
                rootFile = { type: 'filePath', filePath: root.fsPath }
            } else {
                rootFile = { type: 'uri', uri: root }
            }
        }
        this._rootFile = rootFile
    }

    get localRootFile() {
        return this._localRootFile
    }

    set localRootFile(localRoot: string | undefined) {
        this._localRootFile = localRoot
    }

    get rootFileLanguageId() {
        return this._rootFileLanguageId
    }

    set rootFileLanguageId(id: string | undefined) {
        this._rootFileLanguageId = id
    }

    getWorkspaceFolderRootDir(): vscode.WorkspaceFolder | undefined {
        const rootFileUri = this.rootFileUri
        if (rootFileUri) {
            return vscode.workspace.getWorkspaceFolder(rootFileUri)
        }
        return undefined
    }

    private inferLanguageId(filename: string): string | undefined {
        const ext = path.extname(filename).toLocaleLowerCase()
        if (ext === '.tex') {
            return 'latex'
        } else if (this.jlweaveExt.includes(ext)) {
            return 'jlweave'
        } else if (this.rsweaveExt.includes(ext)) {
            return 'rsweave'
        } else if (ext === '.dtx') {
            return 'doctex'
        } else {
            return undefined
        }
    }

    /**
     * Returns the path of a PDF file with respect to `texPath`.
     *
     * @param texPath The path of a LaTeX file.
     * @param respectOutDir If `true`, the 'latex.outDir' config is respected.
     */
    tex2pdf(texPath: string, respectOutDir: boolean = true) {
        let outDir = './'
        if (respectOutDir) {
            outDir = this.getOutDir(texPath)
        }
        return path.resolve(path.dirname(texPath), outDir, path.basename(`${texPath.substring(0, texPath.lastIndexOf('.'))}.pdf`))
    }

    ignorePdfFile(rootFile: string) {
        const pdfFilePath = this.tex2pdf(rootFile)
        const pdfFileUri = vscode.Uri.file(pdfFilePath)
        this.pdfWatcher.ignorePdfFile(pdfFileUri)
    }

    isLocalLatexDocument(document: vscode.TextDocument) {
        return isLocalUri(document.uri) && this.hasTexId(document.languageId)
    }

    /**
     * Returns `true` if the language of `id` is one of supported languages.
     *
     * @param id The language identifier
     */
    hasTexId(id: string) {
        return ['tex', 'latex', 'latex-expl3', 'doctex', 'jlweave', 'rsweave'].includes(id)
    }

    private isTexOrWeaveFile(fileUri: vscode.Uri) {
        return ['.tex', ...this.weaveExt].find(suffix => fileUri.path.toLocaleLowerCase().endsWith(suffix))
    }

    /**
     * Returns `true` if the language of `id` is bibtex
     *
     * @param id The language identifier
     */
    hasBibtexId(id: string) {
        return id === 'bibtex'
    }


    private findWorkspace(): vscode.Uri | undefined {
        const firstDir = vscode.workspace.workspaceFolders?.[0]
        // If no workspace is opened.
        if (!firstDir) {
            return undefined
        }
        // If we don't have an active text editor, we can only make a guess.
        // Let's guess the first one.
        if (!vscode.window.activeTextEditor) {
            return firstDir.uri
        }
        // Get the workspace folder which contains the active document.
        const activeFileUri = vscode.window.activeTextEditor.document.uri
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(activeFileUri)
        if (workspaceFolder) {
            return workspaceFolder.uri
        }
        // Guess that the first workspace is the chosen one.
        return firstDir.uri
    }

    /**
     * Finds the root file with respect to the current workspace and returns it.
     * The found root is also set to `rootFile`.
     */
    private async findRoot() {
        return this.findRootMutex.noopIfOccupied(async () => {
            const rootFilePromise = new ExternalPromise<string | undefined>()
            try {
                this.#rootFilePromise = rootFilePromise
                const wsfolders = vscode.workspace.workspaceFolders?.map(e => e.uri.toString(true))
                this.extension.logger.info(`Current workspace folders: ${JSON.stringify(wsfolders)}`)
                this.localRootFile = undefined
                const findMethods = [
                    () => this.finderUtils.findRootFromMagic(),
                    () => this.findRootFromActive(),
                    () => this.findRootFromCurrentRoot(),
                    () => this.findRootInWorkspace()
                ]
                for (const method of findMethods) {
                    const rootFile = await method()
                    if (rootFile === undefined) {
                        continue
                    }
                    if (this.rootFile !== rootFile) {
                        this.extension.logger.info(`Root file changed: from ${this.rootFile} to ${rootFile}`)
                        this.extension.logger.info('Start to find all dependencies.')
                        this.rootFile = rootFile
                        this.rootFileLanguageId = this.inferLanguageId(rootFile)
                        this.extension.logger.info(`Root file languageId: ${this.rootFileLanguageId}`)
                        await this.resetFileWatcherAndComponents()
                        await this.parseFileAndSubs(this.rootFile, this.rootFile) // Finishing the parsing is required for subsequent refreshes.
                        // We need to parse the fls to discover file dependencies when defined by TeX macro
                        // It happens a lot with subfiles, https://tex.stackexchange.com/questions/289450/path-of-figures-in-different-directories-with-subfile-latex
                        await this.parseFlsFile(this.rootFile)
                        this.extension.eventBus.fire(eventbus.RootFileChanged, rootFile)
                    } else {
                        this.extension.logger.info(`Keep using the same root file: ${this.rootFile}`)
                    }
                    rootFilePromise.resolve(rootFile)
                    return rootFile
                }
                return undefined
            } finally {
                this.extension.eventBus.fire(eventbus.FindRootFileEnd)
                // noop if already resolved
                rootFilePromise.resolve(undefined)
            }
        })
    }

    private logWatchedFiles(delay = 2000) {
        return setTimeout(
            () => {
                this.extension.logger.debug(`Manager.filesWatched: ${JSON.stringify(Array.from(this.watchedFiles))}`)
                this.bibWatcher.logWatchedFiles()
                this.pdfWatcher.logWatchedFiles()
            },
            delay
        )
    }

    private findRootFromCurrentRoot(): string | undefined {
        if (!vscode.window.activeTextEditor || this.rootFile === undefined) {
            return undefined
        }
        if (isVirtualUri(vscode.window.activeTextEditor.document.uri)) {
            this.extension.logger.info(`The active document cannot be used as the root file: ${vscode.window.activeTextEditor.document.uri.toString(true)}`)
            return undefined
        }
        if (this.getIncludedTeX().includes(vscode.window.activeTextEditor.document.fileName)) {
            return this.rootFile
        }
        return undefined
    }

    private async findRootFromActive() {
        if (!vscode.window.activeTextEditor) {
            return undefined
        }
        if (isVirtualUri(vscode.window.activeTextEditor.document.uri)) {
            this.extension.logger.info(`The active document cannot be used as the root file: ${vscode.window.activeTextEditor.document.uri.toString(true)}`)
            return undefined
        }
        const regex = /\\begin{document}/m
        const content = utils.stripCommentsAndVerbatim(vscode.window.activeTextEditor.document.getText())
        const result = content.match(regex)
        if (result) {
            const rootSubFile = await this.finderUtils.findSubFiles(content)
            const file = vscode.window.activeTextEditor.document.fileName
            if (rootSubFile) {
               this.localRootFile = file
               return rootSubFile
            } else {
                this.extension.logger.info(`Found root file from active editor: ${file}`)
                return file
            }
        }
        return undefined
    }

    private async findRootInWorkspace(): Promise<string | undefined> {
        const currentWorkspaceDirUri = this.findWorkspace()
        this.extension.logger.info(`Current workspaceRootDir: ${currentWorkspaceDirUri ? currentWorkspaceDirUri.toString(true) : ''}`)

        if (!currentWorkspaceDirUri) {
            return undefined
        }

        const configuration = vscode.workspace.getConfiguration('latex-workshop', currentWorkspaceDirUri)
        const rootFilesIncludePatterns = configuration.get('latex.search.rootFiles.include') as string[]
        const rootFilesIncludeGlob = '{' + rootFilesIncludePatterns.join(',') + '}'
        const rootFilesExcludePatterns = configuration.get('latex.search.rootFiles.exclude') as string[]
        const rootFilesExcludeGlob = rootFilesExcludePatterns.length > 0 ? '{' + rootFilesExcludePatterns.join(',') + '}' : undefined
        try {
            const files = await vscode.workspace.findFiles(rootFilesIncludeGlob, rootFilesExcludeGlob)
            const candidates: string[] = []
            for (const file of files) {
                if (isVirtualUri(file)) {
                    this.extension.logger.info(`Skip the file: ${file.toString(true)}`)
                    continue
                }
                const flsChildren = await this.getTeXChildrenFromFls(file.fsPath)
                if (vscode.window.activeTextEditor && flsChildren.includes(vscode.window.activeTextEditor.document.fileName)) {
                    this.extension.logger.info(`Found root file from '.fls': ${file.fsPath}`)
                    return file.fsPath
                }
                let content = await readFileGracefully(file) || ''
                content = utils.stripCommentsAndVerbatim(content)
                if (/\\begin{document}/m.exec(content)) {
                    // Can be a root
                    const children = await this.getTeXChildren(file.fsPath, file.fsPath)
                    if (vscode.window.activeTextEditor && children.includes(vscode.window.activeTextEditor.document.fileName)) {
                        this.extension.logger.info(`Found root file from parent: ${file.fsPath}`)
                        return file.fsPath
                    }
                    // Not including the active file, yet can still be a root candidate
                    candidates.push(file.fsPath)
                }
            }
            if (candidates.length > 0) {
                this.extension.logger.info(`Found files that might be root, choose the first one: ${candidates}`)
                return candidates[0]
            }
        } catch (e) {}
        return undefined
    }

    /**
     * Return a string array which holds all imported bib files
     * from the given tex `file`. If `file` is `undefined`, traces from the
     * root file, or return empty array if the root file is `undefined`
     *
     * @param file The path of a LaTeX file
     */
    getIncludedBib(file?: string, memoChildren = new Set<string>()): string[] {
        const includedBib: string[] = []
        if (file === undefined) {
            file = this.rootFile
        }
        if (file === undefined) {
            return []
        }
        const cache = this.getCachedContent(file)
        if (!cache) {
            return []
        }

        memoChildren.add(file)
        includedBib.push(...cache.bibs)
        for (const child of cache.children) {
            if (memoChildren.has(child.file)) {
                continue
            }
            includedBib.push(...this.getIncludedBib(child.file, memoChildren))
        }
        // Make sure to return an array with unique entries
        return Array.from(new Set(includedBib))
    }

    /**
     * Return a string array which holds all imported tex files
     * from the given `file` including the `file` itself.
     * If `file` is `undefined`, trace from the * root file,
     * or return empty array if the root file is `undefined`
     *
     * @param file The path of a LaTeX file
     */
    getIncludedTeX(file?: string, includedTeX: string[] = []): string[] {
        if (file === undefined) {
            file = this.rootFile
        }
        if (file === undefined) {
            return []
        }
        const cache = this.getCachedContent(file)
        if (!cache) {
            return []
        }
        includedTeX.push(file)
        for (const child of cache.children) {
            if (includedTeX.includes(child.file)) {
                continue
            }
            this.getIncludedTeX(child.file, includedTeX)
        }
        return includedTeX
    }

    /**
     * Get the buffer content of a file if it is opened in vscode. Otherwise, read the file from disk
     */
    async getDirtyContent(file: string): Promise<string | undefined> {
        const doc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === file)
        const content = doc?.getText() || await readFilePathGracefully(file)
        if (content === undefined) {
            this.extension.logger.info(`Cannot read dirty content of unknown: ${file}`)
            return
        }
        return content
    }

    private isExcluded(file: string): boolean {
        const globsToIgnore = vscode.workspace.getConfiguration('latex-workshop').get('latex.watch.files.ignore') as string[]
        const format = (str: string): string => {
            if (os.platform() === 'win32') {
                return str.replace(/\\/g, '/')
            }
            return str
        }
        return micromatch.some(file, globsToIgnore, { format })
    }

    /**
     * Searches the subfiles, `\input` siblings, `.bib` files, and related `.fls` file
     * to construct a file dependency data structure related to `file` in `this.cachedContent`.
     *
     * This function is called when the root file is found or a watched file is changed.
     *
     * !! Be careful not to create an infinite loop with parseInputFiles !!
     *
     * @param file The path of a LaTeX file. It is added to the watcher if not being watched.
     * @param maybeRootFile The file currently considered as the rootFile. If undefined, we use `file`
     */
    private async parseFileAndSubs(file: string, maybeRootFile: string | undefined) {
        if (this.isExcluded(file)) {
            this.extension.logger.info(`Ignoring: ${file}`)
            return
        }
        if (maybeRootFile === undefined) {
            maybeRootFile = file
        }
        this.extension.logger.info(`Parsing a file and its subfiles: ${file}`)
        // Initialize the cache for the file
        this.gracefulCachedContent(file)
        if (!this.isWatched(file)) {
            // The file is considered for the first time.
            // We must add the file to watcher to make sure we avoid infinite loops
            // in case of circular inclusion
            this.addToFileWatcher(file)
            await this.updateCompleterElement(vscode.Uri.file(file))
        }
        let content = await this.getDirtyContent(file)
        if (!content) {
            return
        }
        content = utils.stripCommentsAndVerbatim(content)
        await this.parseInputFiles(content, file, maybeRootFile)
        await this.findAndParseBibFilesInContent(content, file)
    }

    /**
     * Return the list of files (recursively) included in `file`
     *
     * @param file The file in which children are recursively computed
     * @param maybeRootFile The file currently considered as the rootFile
     *
     */
    private async getTeXChildren(file: string, maybeRootFile: string, children = new Set<string>()): Promise<string[]> {
        let content = await readFilePathGracefully(file) || ''
        content = utils.stripCommentsAndVerbatim(content)

        const inputFileRegExp = new InputFileRegExp()
        const newChildren = new Set<string>()
        while (true) {
            const result = await inputFileRegExp.exec(content, file, maybeRootFile)
            if (!result) {
                break
            }
            if (!await existsPath(result.path) || path.relative(result.path, maybeRootFile) === '') {
                continue
            }
            newChildren.add(result.path)
        }

        for (const childFilePath of newChildren) {
            if (children.has(childFilePath)) {
                continue
            }
            children.add(childFilePath)
            await this.getTeXChildren(childFilePath, maybeRootFile, children)
        }
        return Array.from(children)
    }

    private async getTeXChildrenFromFls(texFile: string) {
        const flsFile = await this.pathUtils.getFlsFilePath(texFile)
        if (flsFile === undefined) {
            return []
        }
        const rootDir = path.dirname(texFile)
        const content = await readFilePath(flsFile)
        const ioFiles = this.pathUtils.parseFlsContent(content, rootDir)
        return ioFiles.input
    }

    /**
     * Parse the content of the currentFile and call parseFileAndSubs for every included file.
     * This function is called by parseFileAndSubs.
     *
     * !! Be careful not to create an infinite loop with parseFileAndSubs !!
     *
     * @param content the content of currentFile
     * @param currentFile the name of the current file
     * @param maybeRootFile the name of the supposed rootFile
     */
    private async parseInputFiles(content: string, currentFile: string, maybeRootFile: string) {
        this.gracefulCachedContent(currentFile).children = []
        const inputFileRegExp = new InputFileRegExp()
        while (true) {
            const result = await inputFileRegExp.exec(content, currentFile, maybeRootFile)
            if (!result) {
                break
            }

            if (!await existsPath(result.path) || path.relative(result.path, maybeRootFile) === '') {
                continue
            }

            this.gracefulCachedContent(currentFile).children.push({
                file: result.path
            })

            if (this.isWatched(result.path)) {
                // This file is already watched. Ignore it to avoid infinite loops
                // in case of circular inclusion.
                // Note that parseFileAndSubs calls parseInputFiles in return
                continue
            }
            await this.parseFileAndSubs(result.path, maybeRootFile)
        }
    }

    private async findAndParseBibFilesInContent(content: string, currentFile: string) {
        this.gracefulCachedContent(currentFile).bibs = []
        const bibReg = /(?:\\(?:bibliography|addbibresource)(?:\[[^[\]{}]*\])?){(.+?)}|(?:\\putbib)\[(.+?)\]/g
        while (true) {
            const result = bibReg.exec(content)
            if (!result) {
                break
            }
            const bibs = (result[1] ? result[1] : result[2]).split(',').map((bib) => {
                return bib.trim()
            })
            for (const bib of bibs) {
                const bibPath = await this.pathUtils.resolveBibPath(bib, path.dirname(currentFile))
                if (bibPath === undefined) {
                    continue
                }
                this.gracefulCachedContent(currentFile).bibs.push(bibPath)
                await this.bibWatcher.watchAndParseBibFile(bibPath)
            }
        }
    }

    /**
     * Parses the content of a `.fls` file attached to the given `srcFile`.
     * All `INPUT` files are considered as subfiles/non-tex files included in `srcFile`,
     * and all `OUTPUT` files will be checked if they are `.aux` files.
     * If so, the `.aux` files are parsed for any possible `.bib` files.
     *
     * This function is called after a successful build, when looking for the root file,
     * and to compute the cachedContent tree.
     *
     * @param texFile The path of a LaTeX file.
     */
    private async parseFlsFile(texFile: string) {
        return this.parseFlsMutex.noopIfOccupied(async () => {
            this.extension.logger.info('Parse fls file.')
            const flsFile = await this.pathUtils.getFlsFilePath(texFile)
            if (flsFile === undefined) {
                return
            }
            const rootDir = path.dirname(texFile)
            const outDir = this.getOutDir(texFile)
            const content = await readFilePath(flsFile)
            const ioFiles = this.pathUtils.parseFlsContent(content, rootDir)

            for (const inputFile of ioFiles.input) {
                // Drop files that are also listed as OUTPUT or should be ignored
                if (ioFiles.output.includes(inputFile) || this.isExcluded(inputFile) || !await existsPath(inputFile)) {
                    continue
                }
                if (inputFile === texFile || this.isWatched(inputFile)) {
                    // Drop the current rootFile often listed as INPUT
                    // Drop any file that is already watched as it is handled by
                    // onWatchedFileChange.
                    continue
                }
                if (this.isTexOrWeaveFile(vscode.Uri.file(inputFile))) {
                    // Parse tex files as imported subfiles.
                    this.gracefulCachedContent(texFile).children.push({
                        file: inputFile
                    })
                    await this.parseFileAndSubs(inputFile, texFile)
                } else if (!this.isWatched(inputFile)) {
                    // Watch non-tex files.
                    this.addToFileWatcher(inputFile)
                }
            }

            for (const outputFile of ioFiles.output) {
                if (path.extname(outputFile) === '.aux' && await existsPath(outputFile)) {
                    this.extension.logger.info(`Parse aux file: ${outputFile}`)
                    const outputFileContent = await readFilePath(outputFile)
                    await this.parseAuxFile(
                        outputFileContent,
                        path.dirname(outputFile).replace(outDir, rootDir)
                    )
                }
            }
        })
    }

    private async parseAuxFile(content: string, srcDir: string) {
        const regex = /^\\bibdata{(.*)}$/gm
        while (true) {
            const result = regex.exec(content)
            if (!result) {
                return
            }
            const bibs = (result[1] ? result[1] : result[2]).split(',').map((bib) => {
                return bib.trim()
            })
            for (const bib of bibs) {
                const bibPath = await this.pathUtils.resolveBibPath(bib, srcDir)
                if (bibPath === undefined) {
                    continue
                }
                if (this.rootFile && !this.gracefulCachedContent(this.rootFile).bibs.includes(bibPath)) {
                    this.gracefulCachedContent(this.rootFile).bibs.push(bibPath)
                }
                await this.bibWatcher.watchAndParseBibFile(bibPath)
            }
        }
    }

    private isWatched(file: string | vscode.Uri) {
        const uri = file instanceof vscode.Uri ? file : vscode.Uri.file(file)
        const key = this.toKey(uri)
        return this.watchedFiles.has(key)
    }

    private addToFileWatcher(file: string) {
        const uri = vscode.Uri.file(file)
        const key = this.toKey(uri)
        this.lwFileWatcher.add(uri)
        this.watchedFiles.add(key)
    }

    private registerListeners(fileWatcher: LwFileWatcher) {
        fileWatcher.onDidCreate((uri) => this.onWatchingNewFile(uri))
        fileWatcher.onDidChange((uri) => this.onWatchedFileChanged(uri))
        fileWatcher.onDidDelete((uri) => this.onWatchedFileDeleted(uri))
    }

    private resetFileWatcherAndComponents() {
        this.extension.logger.info('Clear watched files.')
        this.watchedFiles.clear()
        // We also clean the completions from the old project
        this.extension.completer.input.reset()
        this.extension.duplicateLabels.reset()
    }

    private toKey(fileUri: vscode.Uri) {
        return fileUri.fsPath
    }

    private onWatchingNewFile(fileUri: vscode.Uri) {
        this.extension.logger.info(`Added to file watcher: ${fileUri}`)
        if (this.isTexOrWeaveFile(fileUri)) {
            return this.updateContentEntry(fileUri)
        }
        return
    }

    private async onWatchedFileChanged(fileUri: vscode.Uri) {
        if (!this.isWatched(fileUri)) {
            return
        }
        this.extension.logger.info(`File watcher - file changed: ${fileUri}`)
        // It is possible for either tex or non-tex files in the watcher.
        if (this.isTexOrWeaveFile(fileUri)) {
            await this.updateContentEntry(fileUri)
        }
        await this.buildOnFileChanged(fileUri.fsPath)
    }

    private onWatchedFileDeleted(fileUri: vscode.Uri) {
        const key = this.toKey(fileUri)
        if (!this.isWatched(fileUri)) {
            return
        }
        this.extension.logger.info(`File watcher - file deleted: ${fileUri}`)
        this.watchedFiles.delete(key)
        this.cachedContent.delete(fileUri.fsPath)
        if (fileUri.fsPath === this.rootFile) {
            this.extension.logger.info(`Root file deleted: ${fileUri}`)
            this.extension.logger.info('Start searching a new root file.')
            void this.findRoot()
        }
    }

    watchPdfFile(pdfFileUri: vscode.Uri) {
        this.pdfWatcher.watchPdfFile(pdfFileUri)
    }

    private autoBuild(file: string, bibChanged: boolean ) {
        this.extension.logger.info(`Auto build started detecting the change of a file: ${file}`)
        const configuration = vscode.workspace.getConfiguration('latex-workshop', vscode.Uri.file(file))
        if (!bibChanged && this.localRootFile && configuration.get('latex.rootFile.useSubFile')) {
            return this.extension.commander.build(true, this.localRootFile, this.rootFileLanguageId)
        } else {
            return this.extension.commander.build(true, this.rootFile, this.rootFileLanguageId)
        }
    }

    buildOnFileChanged(file: string, bibChanged: boolean = false) {
        const configuration = vscode.workspace.getConfiguration('latex-workshop', vscode.Uri.file(file))
        if (configuration.get('latex.autoBuild.run') as string !== BuildEvents.onFileChange) {
            return
        }
        return this.autoBuild(file, bibChanged)
    }

    private buildOnSave(file: string) {
        const configuration = vscode.workspace.getConfiguration('latex-workshop', vscode.Uri.file(file))
        if (configuration.get('latex.autoBuild.run') as string !== BuildEvents.onSave) {
            return
        }
        this.extension.logger.info(`Auto build started on saving file: ${file}`)
        return this.autoBuild(file, false)
    }

    private async updateContentEntry(fileUri: vscode.Uri) {
        return this.updateContentEntryMutex.noopIfOccupied(async () => {
            const filePath = fileUri.fsPath
            await this.parseFileAndSubs(filePath, this.rootFile)
            await this.updateCompleterElement(fileUri)
        })
    }

    // This function updates all completers upon tex-file changes.
    private async updateCompleterElement(texFileUri: vscode.Uri) {
        const filePath = texFileUri.fsPath
        return this.updateCompleterMutex.noopIfOccupied(async () => {
            const content = await this.getDirtyContent(filePath)
            if (!content) {
                return
            }
            await this.extension.completionUpdater.updateCompleter(filePath, content)
            this.extension.completer.input.setGraphicsPath(content)
        })
    }

}
