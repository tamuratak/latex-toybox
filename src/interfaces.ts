import type {latexParser, bibtexParser} from 'latex-utensils'
import type vscode from 'vscode'
import { StepCommand } from './components/builder'
import { BuildStepLog } from './components/compilerlog'
import { LogEntry } from './components/compilerloglib/core'
import type { EventArgTypeMap, EventBus, EventName } from './components/eventbus'
import type {SyncTeXRecordForward} from './components/locator'
import type {CachedContentEntry} from './components/manager'
import { ReferenceStore } from './components/referencestore'
import { CiteSuggestion } from './providers/completer/citation'
import type {ICommand, ILwCompletionItem} from './providers/completer/interface'
import type {ClientRequest} from '../types/latex-workshop-protocol-types'

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

export interface ICompleter extends CommandLocator {
    readonly readyPromise: Promise<void>,
    readonly citation: ICitation,
    readonly input: IInput
}

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

export interface ExtensionContextLocator {
    readonly extensionContext: vscode.ExtensionContext
}

export interface ExtensionRootLocator {
    readonly extensionRoot: string
}

export interface BuilderLocator {
    readonly builder: IBuilder
}

export interface IBuilder {
    readonly tmpDir: string,
    onDidBuild(cb: (file: string) => unknown): vscode.Disposable
}

export interface LoggerLocator {
    readonly logger: ILogger
}

export interface ILogger {
    info(message: string): void,
    logCommand(message: string, command: string, args?: string[]): void,
    debug(message: string): void,
    error(message: string): void,
    logError(e: Error): void,
    logOnRejected(e: unknown): void,
    showLog(): void
}

export interface ILwStatusBarItem {
    displayStatus(
        status: 'success' | 'fail' | 'ongoing',
        message?: string,
        build?: string
    ): void
}

export interface LwStatusBarItemLocator {
    readonly statusbaritem: ILwStatusBarItem
}

export interface ICompilerLog {
    createStepLog(_rootfile: string | undefined, steps: StepCommand[], stepIndex: number): BuildStepLog,
    dispose(): void,
    clear(): void,
    parse(stepLog: BuildStepLog, rootFile?: string): Promise<void> | void,
    showCompilerDiagnostics(compilerDiagnostics: vscode.DiagnosticCollection, buildLog: LogEntry[], source: string): void,
    isLaTeXmkSkipped: boolean,
    show(): void
}

export interface CompilerLogLocator {
    readonly compilerLog: ICompilerLog
}

export interface IManager {
    readonly rootDir: string | undefined,
    readonly rootFile: string | undefined,
    readonly rootFileUri: vscode.Uri | undefined,
    readonly cachedFilePaths: IterableIterator<string>,
    localRootFile: string | undefined,
    getOutDir(texPath?: string): string,
    getCachedContent(filePath: string): Readonly<CachedContentEntry> | undefined,
    isLocalLatexDocument(document: vscode.TextDocument): boolean,
    hasTexId(id: string): boolean,
    hasBibtexId(id: string): boolean,
    ignorePdfFile(rootFile: string): void,
    getIncludedBib(file?: string): string[],
    getIncludedTeX(file?: string): string[],
    getDirtyContent(file: string): Promise<string | undefined>,
    getWorkspaceFolderRootDir(): vscode.WorkspaceFolder | undefined,
    tex2pdf(texPath: string, respectOutDir?: boolean): string,
    watchPdfFile(pdfFileUri: vscode.Uri): void
}

export interface ManagerLocator {
    readonly manager: IManager
}

export interface IUtensilsParser {
    dispose(): void,
    parseLatex(s: string, options?: latexParser.ParserOptions): Promise<latexParser.LatexAst | undefined>,
    parseLatexPreamble(s: string): Promise<latexParser.AstPreamble>,
    parseBibtex(s: string, options?: bibtexParser.ParserOptions): Promise<bibtexParser.BibtexAst>
}

export interface UtensilsParserLocator {
    readonly utensilsParser: IUtensilsParser
}

export interface IServer {
    readonly serverStarted: Promise<void>,
    readonly port: number,
    dispose(): void
}

export interface ServerLocator {
    readonly server: IServer
}

export interface IViewer {
    syncTeX(pdfFile: string, record: SyncTeXRecordForward): void,
    refreshExistingViewer(sourceFile?: string, pdfFileUri?: vscode.Uri): void
}

export interface ViewerLocator {
    readonly viewer: IViewer
}

export interface ILocator {
    syncTeX(args?: {line: number, filePath: string}, forcedViewer?: 'auto' | 'tabOrBrowser' | 'external', pdfFile?: string): Promise<void>,
    locate(data: Extract<ClientRequest, {type: 'reverse_synctex'}>, pdfPath: string): Promise<void>
}

export interface LocatorLocator {
    readonly locator: ILocator
}

export interface ICitation {
    getEntry(key: string): CiteSuggestion | undefined,
    getEntryWithDocumentation(key: string, configurationScope: vscode.ConfigurationScope | undefined): ILwCompletionItem | undefined
}

export interface IInput {
    graphicsPath: string[]
}

export interface ISnippetView {
    renderPdf(pdfFileUri: vscode.Uri, opts: { height: number, width: number, pageNumber: number }): Promise<string | undefined>,
    readonly snippetViewProvider: {
        webviewView: vscode.WebviewView | undefined
    }
}

export interface SnippetViewLocator {
    readonly snippetView: ISnippetView
}
