import type fs from 'fs'
import type {latexParser, bibtexParser} from 'latex-utensils'
import type vscode from 'vscode'
import type { EventArgTypeMap, EventBus, EventName } from './components/eventbus'
import type {SyncTeXRecordForward} from './components/locator'
import type {CachedContentEntry} from './components/manager'
import { ReferenceStore } from './components/referencestore'
import type {ICommand} from './providers/completer/interface'


export interface ReferenceStoreLocator {
    readonly referenceStore: ReferenceStore
}

export interface IEventBus {
    fire<T extends keyof EventArgTypeMap>(eventName: T, arg: EventArgTypeMap[T]): void,
    fire(eventName: EventName): void,
    fire(eventName: EventName, arg?: any): void,
    onDidChangeRootFile(cb: (rootFile: EventArgTypeMap['rootfilechanged']) => void): vscode.Disposable,
    onDidEndFindRootFile(cb: () => void): vscode.Disposable,
    onDidChangePdfViewerStatus(cb: (status: EventArgTypeMap['pdfviewerstatuschanged']) => void): vscode.Disposable
}

export interface EventBusLocator {
    readonly eventBus: EventBus
}

export interface CommandLocator {
    readonly command: ICommand
}

export interface ICompleter extends
    CommandLocator { }

export interface CompleterLocator {
    readonly completer: ICompleter
}

export interface ICompletionStore {
    dummy: string
 }

export interface CompletionStoreLocator {
    readonly completionStore: ICompletionStore
}

export interface CompletionUpdaterLocator {
    readonly completionUpdater: ICompleteionUpdater
}

export interface ICompleteionUpdater {
    readonly definedCmds: Map<string, {
        file: string,
        location: vscode.Location
    }>,
    onDidUpdate(cb: (file: string) => void): vscode.Disposable,
    updateCompleter(file: string, content: string): Promise<void>
}

export interface ExtensionRootLocator {
    readonly extensionRoot: string
}

export interface BuilderLocator {
    readonly builder: IBuilder
}

export interface IBuilder {
    readonly tmpDir: string,
    readonly disableBuildAfterSave: boolean
}

export interface LoggerLocator {
    readonly logger: ILogger
}

export interface ILogger {
    addLogMessage(message: string): void,
    logCommand(message: string, command: string, args: string[]): void,
    addCompilerMessage(message: string): void,
    logError(e: Error): void,
    logOnRejected(e: unknown): void,
    clearCompilerMessage(): void,
    displayStatus(
        icon: string,
        color: string,
        message: string | undefined,
        severity: 'info' | 'warning' | 'error',
        build: string
    ): void,
    showErrorMessage(message: string, ...args: string[]): Thenable<string | undefined> | undefined,
    showErrorMessageWithCompilerLogButton(message: string): void,
    showErrorMessageWithExtensionLogButton(message: string): void,
    showLog(): void,
    showCompilerLog(): void
}

export interface LwfsLocator {
    readonly lwfs: ILwFileSystem
}

export interface ILwFileSystem {
    isLocalUri(uri: vscode.Uri): boolean,
    isVirtualUri(uri: vscode.Uri): boolean,
    exists(uri: vscode.Uri): Promise<boolean>,
    readFilePath(filePath: string): Promise<string>,
    readFile(fileUri: vscode.Uri): Promise<string>,
    readFileAsBuffer(fileUri: vscode.Uri): Promise<Buffer>,
    readFileSyncGracefully(filepath: string): string | undefined,
    stat(fileUri: vscode.Uri): Promise<fs.Stats | vscode.FileStat>
}

export interface ManagerLocator {
    readonly manager: IManager
}

export interface IManager {
    readonly rootDir: string | undefined,
    readonly rootFile: string | undefined,
    readonly rootFileUri: vscode.Uri | undefined,
    readonly cachedFilePaths: IterableIterator<string>,
    getOutDir(texPath?: string): string,
    getCachedContent(filePath: string): CachedContentEntry | undefined,
    hasTexId(id: string): boolean,
    hasBibtexId(id: string): boolean,
    findRoot(): Promise<string | undefined>,
    getIncludedBib(file?: string): string[],
    getIncludedTeX(file?: string): string[],
    getDirtyContent(file: string): string | undefined,
    getWorkspaceFolderRootDir(): vscode.WorkspaceFolder | undefined,
    tex2pdf(texPath: string, respectOutDir?: boolean): string
}

export interface UtensilsParserLocator {
    readonly pegParser: IUtensilsParser
}

export interface IUtensilsParser {
    dispose(): void,
    parseLatex(s: string, options?: latexParser.ParserOptions): Promise<latexParser.LatexAst | undefined>,
    parseLatexPreamble(s: string): Promise<latexParser.AstPreamble>,
    parseBibtex(s: string, options?: bibtexParser.ParserOptions): Promise<bibtexParser.BibtexAst>
}

export interface ViewerLocator {
    readonly viewer: IViewer
}

export interface IViewer {
    syncTeX(pdfFile: string, record: SyncTeXRecordForward): void
}
