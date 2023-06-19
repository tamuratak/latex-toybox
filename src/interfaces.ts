import type {latexParser, bibtexParser} from 'latex-utensils'
import type vscode from 'vscode'
import { StepCommand } from './components/builder'
import { BuildStepLog } from './components/compilerlog'
import { LogEntry } from './components/compilerloglib/core'
import type {SyncTeXRecordForward} from './components/locator'
import type {CachedContentEntry} from './components/manager'
import { ReferenceStore } from './components/referencestore'
import { CiteSuggestion } from './providers/completer/citation'
import type {ICommand, ILwCompletionItem} from './providers/completer/interface'
import type {ClientRequest, PdfViewerState} from '../types/latex-workshop-protocol-types'
import { AwaitableEventEmitter } from './components/eventbuslib/awaitableeventemitter'
import { BibtexAst, LatexAst } from './utils/utensils'


export interface ReferenceStoreLocator {
    readonly referenceStore: ReferenceStore
}

export interface IEventBus {
    readonly buildFinished: AwaitableEventEmitter<string, 'buildfinished'>,
    readonly pdfViewerStatusChanged: AwaitableEventEmitter<PdfViewerState, 'pdfviewerstatuschanged'>,
    readonly pdfViewerPagesLoaded: AwaitableEventEmitter<vscode.Uri, 'pdfviewerpagesloaded'>,
    readonly rootFileChanged: AwaitableEventEmitter<string, 'rootfilechanged'>,
    readonly findRootFileEnd: AwaitableEventEmitter<string | undefined, 'findrootfileend'>,
    readonly completionUpdated: AwaitableEventEmitter<string, 'completionupdated'>
}

export interface EventBusLocator {
    readonly eventBus: IEventBus
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

export interface CompletionUpdaterLocator {
    readonly completionUpdater: ICompleteionUpdater
}

export interface ICompleteionUpdater {
    readonly definedCmds: Map<string, {
        file: string,
        location: vscode.Location
    }>,
    updateCompleter(file: string, {content, doc}: {content: string, doc: vscode.TextDocument}): Promise<void>
}

export interface ExtensionContextLocator {
    readonly extensionContext: vscode.ExtensionContext
}

export interface ExtensionRootLocator {
    readonly extensionRoot: string
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
        build?: string,
        type?: 'build' | 'other'
    ): void
}

export interface LwStatusBarItemLocator {
    readonly statusbaritem: ILwStatusBarItem
}

export interface ICompilerLog {
    createStepLog(_rootfile: string | undefined, steps: StepCommand[], stepIndex: number): BuildStepLog,
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
    readonly localRootFile: string | undefined,
    getOutDir(texPath?: string): string,
    getCachedContent(filePath: string): Readonly<CachedContentEntry> | undefined,
    ignorePdfFile(rootFile: string): void,
    getIncludedBib(file?: string): string[],
    getIncludedTeX(file?: string): string[],
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

export interface IAstManager<Ast> {
    getDocAst(doc: vscode.TextDocument): Promise<Ast | undefined>,
    getAst(uri: vscode.Uri): Promise<Ast | undefined>
}

export interface LatexAstManagerLocator {
    readonly latexAstManager: IAstManager<LatexAst>
}

export interface BibtexAstManagerLocator {
    readonly bibtexAstManager: IAstManager<BibtexAst>
}

export interface IServer {
    readonly serverStarted: Promise<void>,
    readonly port: number
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
