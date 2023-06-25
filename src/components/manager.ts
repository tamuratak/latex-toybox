import * as vscode from 'vscode'
import * as path from 'path'
import * as utils from '../utils/utils'
import {InputFileRegExp} from '../utils/inputfilepath'
import { isCacheLatest } from '../utils/utils'

import type {CmdEnvSuggestion} from '../providers/completer/command'
import type {CiteSuggestion} from '../providers/completer/citation'
import type {GlossarySuggestion} from '../providers/completer/glossary'

import {PdfWatcher} from './managerlib/pdfwatcher'
import {BibWatcher} from './managerlib/bibwatcher'
import {FinderUtils} from './managerlib/finderutils'
import {PathUtils} from './managerlib/pathutils'

import { LabelDefinitionElement } from '../providers/completer/labeldefinition'
import { existsPath, isLocalLatexDocument, isVirtualUri, readFileGracefully, readFilePath, statPath } from '../lib/lwfs/lwfs'
import { ExternalPromise } from '../utils/externalpromise'
import { MutexWithSizedQueue } from '../utils/mutexwithsizedqueue'
import { LwFileWatcher } from './managerlib/lwfilewatcher'
import { toKey } from '../utils/tokey'
import { getTeXChildren } from './managerlib/gettexchildren'
import { findWorkspace, isExcluded } from './managerlib/utils'
import { getDirtyContent } from '../utils/getdirtycontent'
import { inferLanguageId, isTexOrWeaveFile } from '../utils/hastexid'
import type { Logger } from './logger'
import type { Viewer } from './viewer'
import type { Completer } from '../providers/completion'
import type { EventBus } from './eventbus'
import type { Commander } from '../commander'
import type { DuplicateLabels } from './duplicatelabels'
import type { CompletionUpdater } from './completionupdater'


/**
 * Cache entry for the results of parsing a LaTeX file.
 *
 * For the children and bibs of the rootFile, we cache not only the parsing results,
 * but also the results of parsing .fls and .aux files. In this case,
 * we need to ignore the mtime of each property since it is not valid for .fls and .aux files.
 */
export interface CachedContentEntry {
    /**
     * Completion items that are extracted from the LaTeX file. It is important to note
     * that these items should only be updated by the `CompletionUpdater` class.
     * The `Completer` class aggregates these items and ones from JSON files in the `data/`
     * directory to provide completion suggestions.
     */
    readonly element: {
        labelDefinition: LabelDefinitionElement[],
        glossary: GlossarySuggestion[],
        environment: CmdEnvSuggestion[],
        bibitem: CiteSuggestion[],
        command: CmdEnvSuggestion[],
        package: Set<string>,
        mtime: number
    },
    /**
     * The sub-files of the LaTeX file. They should be tex or plain files.
     * The order of the children is not guaranteed.
     */
    readonly children: {
        cache: Set<string>,
        mtime: number
    },
    /**
     * The paths of `.bib` files referenced from the LaTeX file.
     */
    readonly bibs: {
        cache: Set<string>,
        mtime: number
    }
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

/**
 * Responsible for determining the root file, managing the watcher, and parsing .aux and .fls files.
 */
export class Manager {
    // key: filePath
    private readonly cachedContent = new Map<string, CachedContentEntry>()

    private _localRootFile: string | undefined
    private _rootFileLanguageId: string | undefined
    private _rootFile: RootFileType | undefined

    private readonly lwFileWatcher: LwFileWatcher
    // key: filePath
    private readonly watchedFiles = new Set<string>()
    private readonly pdfWatcher: PdfWatcher
    private readonly bibWatcher: BibWatcher
    private readonly finderUtils: FinderUtils
    private readonly pathUtils: PathUtils
    #rootFilePromise: ExternalPromise<string | undefined> | undefined
    private readonly findRootMutex = new MutexWithSizedQueue(1)
    private readonly parseFlsMutex = new MutexWithSizedQueue(1)
    private readonly updateCompleterMutex = new MutexWithSizedQueue(1)
    private readonly updateContentEntryMutex = new MutexWithSizedQueue(1)

    constructor(private readonly extension: {
        readonly extensionContext: vscode.ExtensionContext,
        readonly eventBus: EventBus,
        readonly commander: Commander,
        readonly completer: Completer,
        readonly completionUpdater: CompletionUpdater,
        readonly duplicateLabels: DuplicateLabels,
        readonly logger: Logger,
        readonly manager: Manager,
        readonly viewer: Viewer
    }) {

        const lwFileWatcher = new LwFileWatcher()
        this.lwFileWatcher = lwFileWatcher
        this.registerListeners(lwFileWatcher)
        this.pdfWatcher = new PdfWatcher(extension, lwFileWatcher)
        this.bibWatcher = new BibWatcher(extension, lwFileWatcher)

        this.finderUtils = new FinderUtils(extension)
        this.pathUtils = new PathUtils(extension)
        this.extension.eventBus.rootFileChanged.event(() => this.logWatchedFiles())

        extension.extensionContext.subscriptions.push(
            vscode.workspace.onDidSaveTextDocument((doc) => {
                if (!isLocalLatexDocument(doc)){
                    return
                }
                void this.buildOnSave(doc.fileName)
            }),
            vscode.window.onDidChangeActiveTextEditor(async (editor) => {
                this.extension.logger.debug(`onDidChangeActiveTextEditor: ${editor?.document.uri.toString()}`)
                if (!editor || !isLocalLatexDocument(editor.document)) {
                    return
                }
                await this.findRoot()
            }),
            vscode.workspace.onDidOpenTextDocument(async (doc) => {
                this.extension.logger.debug(`onDidOpenTextDocument: ${doc.uri.toString()}`)
                if (process.env['LATEXWORKSHOP_CI'] || !isLocalLatexDocument(doc)) {
                    return
                }
                await this.findRoot()
            }),
            new vscode.Disposable(() => this.dispose())
        )

        setTimeout(async () => {
            if (process.env['LATEXWORKSHOP_CI']) {
                return
            }
            let interval = 1000
            while (true) {
                if (this.rootFile) {
                    return
                }
                const editor = vscode.window.visibleTextEditors.find(edt => isLocalLatexDocument(edt.document))
                const activeDocument = vscode.window.activeTextEditor?.document
                this.extension.logger.info(`Initial findRoot calling. activeDocument: ${activeDocument?.uri.toString()}, editor: ${editor?.document.uri.toString()}`)
                if (activeDocument && isLocalLatexDocument(activeDocument)) {
                    await this.findRoot()
                } else if (editor) {
                    await vscode.window.showTextDocument(editor.document, editor.viewColumn)
                }
                await utils.sleep(interval)
                interval *= 1.5
            }
        }, 3000)

        this.extension.eventBus.buildFinished.event((rootFile) => {
            return this.parseFlsFile(rootFile)
        })

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
            const cacheEntry: CachedContentEntry = {
                 element: {
                    bibitem: [],
                    command: [],
                    environment: [],
                    glossary: [],
                    labelDefinition: [],
                    package: new Set(),
                    mtime: 0
                 },
                 children: {
                    cache: new Set(),
                    mtime: 0
                 },
                 bibs: {
                    cache: new Set(),
                    mtime: 0
                 }
            }
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
        texPath = texPath || this.rootFile || './'
        const configuration = vscode.workspace.getConfiguration('latex-workshop', vscode.Uri.file(texPath))
        const outDir = configuration.get('latex.outDir') as string
        const out = utils.replaceArgumentPlaceholders(texPath)(outDir)
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

    private set rootFile(root: string | undefined) {
        if (root) {
            this._rootFile = { type: 'filePath', filePath: root }
        } else {
            this._rootFile = undefined
        }
    }

    /**
     * Returns a promise that resolves to the rootFile. This method is not needed in most cases,
     * as we can simply use the `rootFile` property. Call this method if we need to wait for
     * the completion of the findRoot method.
     */
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

    private set rootFileUri(root: vscode.Uri | undefined) {
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

    /**
     * One of LaTeX subfiles which is the active document.
     * This is set when the `subfiles` package is being used.
     */
    get localRootFile() {
        return this._localRootFile
    }

    private set localRootFile(localRoot: string | undefined) {
        this._localRootFile = localRoot
    }

    get rootFileLanguageId() {
        return this._rootFileLanguageId
    }

    private set rootFileLanguageId(id: string | undefined) {
        this._rootFileLanguageId = id
    }

    getWorkspaceFolderRootDir(): vscode.WorkspaceFolder | undefined {
        const rootFileUri = this.rootFileUri
        if (rootFileUri) {
            return vscode.workspace.getWorkspaceFolder(rootFileUri)
        }
        return undefined
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

    /**
     * Finds the root file relative to the active document and workspace,
     * and sets it as the value of `rootFile`.
     *
     * This method has the side effect of changing the value of rootFile. To prevent rootFile
     * from being changed at an undesirable time, this method is defined as private.
     *
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
                        this.rootFileLanguageId = inferLanguageId(rootFile)
                        this.extension.logger.info(`Root file languageId: ${this.rootFileLanguageId}`)
                        this.resetFileWatcherAndComponents()
                        // Finishing the parsing is required for subsequent refreshes.
                        await this.parseFileAndSubs(this.rootFile, this.rootFile, new Set())
                        // We need to parse the fls to discover file dependencies when defined by TeX macro
                        // It happens a lot with subfiles, https://tex.stackexchange.com/questions/289450/path-of-figures-in-different-directories-with-subfile-latex
                        await this.parseFlsFile(this.rootFile)
                        rootFilePromise.resolve(rootFile)
                        await this.extension.eventBus.rootFileChanged.fire(rootFile)
                    } else {
                        rootFilePromise.resolve(rootFile)
                        this.extension.logger.info(`Keep using the same root file: ${this.rootFile}`)
                    }
                    return rootFile
                }
                return undefined
            } finally {
                await this.extension.eventBus.findRootFileEnd.fire(this.rootFile)
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

    /**
     * This method finds the rootFile from the active document. If the subfiles package is being used,
     * it sets the localRootFile to the active document. Therefore, it must be called before the other
     * findRoot methods.
     */
    private async findRootFromActive() {
        if (!vscode.window.activeTextEditor) {
            return undefined
        }
        if (isVirtualUri(vscode.window.activeTextEditor.document.uri)) {
            this.extension.logger.info(`The active document cannot be used as the root file: ${vscode.window.activeTextEditor.document.uri.toString(true)}`)
            return undefined
        }
        const content = utils.stripCommentsAndVerbatim(vscode.window.activeTextEditor.document.getText())
        if (/\\begin{document}/m.exec(content)) {
            const activeDocFilePath = vscode.window.activeTextEditor.document.fileName
            const mainFileOfActiveDoc = await this.finderUtils.findMainFileFromDocumentClassSubFiles(content)
            if (mainFileOfActiveDoc) {
               this.localRootFile = activeDocFilePath
               return mainFileOfActiveDoc
            } else {
                this.extension.logger.info(`Found root file from active editor: ${activeDocFilePath}`)
                return activeDocFilePath
            }
        }
        return undefined
    }

    private async findRootInWorkspace(): Promise<string | undefined> {
        const currentWorkspaceDirUri = findWorkspace()
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
                    const children = await getTeXChildren(file.fsPath, file.fsPath)
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
        const cacheEntry = this.getCachedContent(file)
        if (!cacheEntry) {
            return []
        }

        memoChildren.add(file)
        includedBib.push(...cacheEntry.bibs.cache)
        for (const child of cacheEntry.children.cache) {
            if (memoChildren.has(child)) {
                continue
            }
            includedBib.push(...this.getIncludedBib(child, memoChildren))
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
        const cacheEntry = this.getCachedContent(file)
        if (!cacheEntry) {
            return []
        }
        includedTeX.push(file)
        for (const child of cacheEntry.children.cache) {
            if (includedTeX.includes(child)) {
                continue
            }
            this.getIncludedTeX(child, includedTeX)
        }
        return includedTeX
    }

    /**
     * Searches the subfiles, `\input` siblings, `.bib` files, and related `.fls` file
     * to construct a file dependency data structure related to `file` in `this.cachedContent`.
     *
     * To prevent race conditions, the caller must properly acquire the mutex lock
     * when making a "root call" that involves passing `new Set()` as an argument.
     *
     * @param file The path of a LaTeX file. It is added to the watcher if not being watched.
     * @param maybeRootFile The file currently considered as the rootFile. If undefined, we use `file`
     */
    private async parseFileAndSubs(file: string, maybeRootFile: string | undefined, alreadyParsed: Set<string>) {
        if (alreadyParsed.has(file)) {
            return
        } else {
            alreadyParsed.add(file)
        }
        if (isExcluded(file)) {
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
            this.addToFileWatcher(file)
            await this.updateCompleterElement(vscode.Uri.file(file))
        }
        let {content} = await getDirtyContent(file)
        if (!content) {
            return
        }
        content = utils.stripCommentsAndVerbatim(content)
        await this.findAndParseBibFilesInContent(content, file)
        await this.parseInputFiles(content, file, maybeRootFile, alreadyParsed)
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
     * @param content the content of currentFile
     * @param currentFile the name of the current file
     * @param maybeRootFile the name of the supposed rootFile
     */
    private async parseInputFiles(
        content: string,
        currentFile: string,
        maybeRootFile: string,
        alreadyParsed: Set<string>
    ) {
        const cacheEntry = this.gracefulCachedContent(currentFile)
        const stat = await statPath(currentFile)
        if (isCacheLatest(cacheEntry.children, stat)) {
            return
        } else {
            cacheEntry.children.cache.clear()
            cacheEntry.children.mtime = 0
        }
        const inputFileRegExp = new InputFileRegExp()
        while (true) {
            const result = await inputFileRegExp.exec(content, currentFile, maybeRootFile)
            if (!result) {
                break
            }

            if (!await existsPath(result.path) || path.relative(result.path, maybeRootFile) === '') {
                continue
            }

            cacheEntry.children.cache.add(result.path)

            // If this file has already been parsed, ignore it to prevent infinite loops
            // in case of circular inclusion.
            if (!alreadyParsed.has(result.path)) {
                await this.parseFileAndSubs(result.path, maybeRootFile, alreadyParsed)
            }
        }
        cacheEntry.children.mtime = stat.mtime
    }

    private async findAndParseBibFilesInContent(content: string, currentFile: string) {
        const cacheEntry = this.gracefulCachedContent(currentFile)
        const stat = await statPath(currentFile)
        if (isCacheLatest(cacheEntry.bibs, stat)) {
            return
        } else {
            cacheEntry.bibs.cache.clear()
            cacheEntry.bibs.mtime = 0
        }
        const bibReg = /(?:\\(?:bibliography|addbibresource)(?:\[[^[\]{}]*\])?){(.+?)}|(?:\\putbib)\[(.+?)\]/g
        while (true) {
            const result = bibReg.exec(content)
            if (!result) {
                break
            }
            const bibs = (result[1] ? result[1] : result[2]).split(',').map(bib => bib.trim())
            for (const bib of bibs) {
                const bibPath = await this.pathUtils.resolveBibPath(bib, path.dirname(currentFile))
                if (bibPath === undefined) {
                    continue
                }
                cacheEntry.bibs.cache.add(bibPath)
                await this.bibWatcher.watchAndParseBibFile(bibPath)
            }
        }
        cacheEntry.bibs.mtime = stat.mtime
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
     * @param rootFile This represents the path of a LaTeX root file that is used in a build process.
     *                 If the `subfiles` package is used, it can be one of the subfiles.
     */
    private async parseFlsFile(rootFile: string) {
        return this.parseFlsMutex.noopIfOccupied(async () => {
            this.extension.logger.info('Parse fls file.')
            const flsFile = await this.pathUtils.getFlsFilePath(rootFile)
            if (flsFile === undefined) {
                return
            }
            const rootDir = path.dirname(rootFile)
            const outDir = this.getOutDir(rootFile)
            const content = await readFilePath(flsFile)
            const ioFiles = this.pathUtils.parseFlsContent(content, rootDir)

            for (const inputFile of ioFiles.input) {
                // Drop files that are also listed as OUTPUT or should be ignored
                if (ioFiles.output.includes(inputFile) || isExcluded(inputFile) || !await existsPath(inputFile)) {
                    continue
                }
                if (inputFile === rootFile || this.isWatched(inputFile)) {
                    continue
                }
                if (isTexOrWeaveFile(vscode.Uri.file(inputFile))) {
                    // Parse tex files as imported subfiles.
                    this.gracefulCachedContent(rootFile).children.cache.add(inputFile)
                    await this.parseFileAndSubs(inputFile, rootFile, new Set())
                }
                this.addToFileWatcher(inputFile)
            }

            for (const outputFile of ioFiles.output) {
                if (path.extname(outputFile) === '.aux' && await existsPath(outputFile)) {
                    this.extension.logger.info(`Parse aux file: ${outputFile}`)
                    const outputFileContent = await readFilePath(outputFile)
                    await this.parseAuxFile(
                        outputFileContent,
                        path.dirname(outputFile).replace(outDir, rootDir),
                        rootFile
                    )
                }
            }
        })
    }

    private async parseAuxFile(content: string, srcDir: string, rootFile: string) {
        const cacheEntry = this.gracefulCachedContent(rootFile)
        const regex = /^\\bibdata{(.*)}$/gm
        while (true) {
            const result = regex.exec(content)
            if (!result) {
                return
            }
            const bibs = (result[1] ? result[1] : result[2]).split(',').map(bib => bib.trim())
            for (const bib of bibs) {
                const bibPath = await this.pathUtils.resolveBibPath(bib, srcDir)
                if (bibPath !== undefined) {
                    cacheEntry.bibs.cache.add(bibPath)
                    await this.bibWatcher.watchAndParseBibFile(bibPath)
                }
            }
        }
    }

    private isWatched(file: string | vscode.Uri) {
        const uri = file instanceof vscode.Uri ? file : vscode.Uri.file(file)
        return this.watchedFiles.has(toKey(uri))
    }

    private addToFileWatcher(file: string) {
        if (isExcluded(file) || this.isWatched(file)) {
            return
        }
        const uri = vscode.Uri.file(file)
        this.lwFileWatcher.add(uri)
        this.watchedFiles.add(toKey(uri))
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

    private onWatchingNewFile(fileUri: vscode.Uri) {
        this.extension.logger.info(`Added to file watcher: ${fileUri}`)
        if (isTexOrWeaveFile(fileUri)) {
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
        if (isTexOrWeaveFile(fileUri)) {
            await this.updateContentEntry(fileUri)
        }
        await this.buildOnFileChanged(fileUri.fsPath)
    }

    private onWatchedFileDeleted(fileUri: vscode.Uri) {
        if (!this.isWatched(fileUri)) {
            return
        }
        this.watchedFiles.delete(toKey(fileUri))
        this.cachedContent.delete(fileUri.fsPath)
        this.extension.logger.info(`File watcher - file deleted: ${fileUri}`)
        if (fileUri.fsPath === this.rootFile) {
            this.extension.logger.info(`Root file deleted: ${fileUri}`)
            this.extension.logger.info('Start searching a new root file.')
            void this.findRoot()
        }
    }

    watchPdfFile(pdfFileUri: vscode.Uri) {
        this.pdfWatcher.watchPdfFile(pdfFileUri)
    }

    /**
     * This function triggers a rebuild of the LaTeX document, determining whether the target is the project's root file or an active subfile.
     *
     * @param file The file path of the file that is changed.
     * @param bibChanged Indicates whether the change is caused by a change in bib file.
     * @returns
     */
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
            await this.parseFileAndSubs(filePath, this.rootFile, new Set())
            await this.updateCompleterElement(fileUri)
        })
    }

    // This function updates all completers upon tex-file changes.
    private async updateCompleterElement(texFileUri: vscode.Uri) {
        const filePath = texFileUri.fsPath
        return this.updateCompleterMutex.noopIfOccupied(async () => {
            const {content, doc} = await getDirtyContent(filePath)
            if (!content) {
                return
            }
            await this.extension.completionUpdater.updateCompleter(filePath, {content, doc})
            this.extension.completer.input.setGraphicsPath(content)
        })
    }

}
