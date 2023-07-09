import * as vscode from 'vscode'
import * as process from 'process'

import {Commander} from './commander'
import {LaTeXCommanderTreeView} from './components/commander'
import {Logger} from './components/logger'
import {Manager} from './components/manager'
import {Builder} from './components/builder'
import {Viewer} from './components/viewer'
import {Server} from './components/server'
import {Locator} from './components/locator'
import {Linter} from './components/linter'
import {EnvPair} from './components/envpair'
import {Section} from './components/section'
import {UtensilsParser} from './components/utensilsparser'
import {Configuration} from './components/configuration'
import {EventBus} from './components/eventbus'

import {Completer} from './providers/completion'
import {DuplicateLabels} from './components/duplicatelabels'
import {GraphicsPreview} from './components/graphicspreview'
import {MathPreview} from './components/mathpreview'
import {MathPreviewPanel} from './components/mathpreviewpanel'
import {SnippetView} from './components/snippetview'
import { ReferenceStore } from './components/referencestore'
import { CompletionUpdater } from './components/completionupdater'
import { LwStatusBarItem } from './components/statusbaritem'
import { CompilerLog } from './components/compilerlog'
import { BibtexAstManager, LatexAstManager } from './components/astmanager'
import { AuxManager } from './components/auxmanager'
import { ProvidersManager } from './providersmanager'
import { StructureTreeView } from './components/structure'


function conflictExtensionCheck() {
    function check(extensionID: string, name: string, suggestion: string) {
        if (vscode.extensions.getExtension(extensionID) !== undefined) {
            void vscode.window.showWarningMessage(`LaTeX Workshop is incompatible with extension "${name}". ${suggestion}`)
        }
    }
    check('tomoki1207.pdf', 'vscode-pdf', 'Please consider disabling either extension.')
}

function registerLatexWorkshopCommands(
    extension: {
        readonly extensionContext: vscode.ExtensionContext,
        readonly commander: Commander
    }
) {

    extension.extensionContext.subscriptions.push(
        vscode.commands.registerCommand('latex-workshop.saveWithoutBuilding', () => extension.commander.saveWithoutBuilding()),
        vscode.commands.registerCommand('latex-workshop.build', () => extension.commander.build()),
        vscode.commands.registerCommand('latex-workshop.recipes', (recipe: string | undefined) => extension.commander.recipes(recipe)),
        vscode.commands.registerCommand('latex-workshop.view', (mode: 'tab' | 'browser' | 'external' | vscode.Uri | undefined) => extension.commander.view(mode)),
        vscode.commands.registerCommand('latex-workshop.refresh-viewer', () => extension.commander.refresh()),
        vscode.commands.registerCommand('latex-workshop.tab', () => extension.commander.view('tab')),
        vscode.commands.registerCommand('latex-workshop.viewInBrowser', () => extension.commander.view('browser')),
        vscode.commands.registerCommand('latex-workshop.viewExternal', () => extension.commander.view('external')),
        vscode.commands.registerCommand('latex-workshop.kill', () => extension.commander.kill()),
        vscode.commands.registerCommand('latex-workshop.synctex', () => extension.commander.synctex()),
        vscode.commands.registerCommand('latex-workshop.texdoc', (pkg: string | undefined) => extension.commander.texdoc(pkg)),
        vscode.commands.registerCommand('latex-workshop.texdocUsepackages', () => extension.commander.texdocUsepackages()),
        vscode.commands.registerCommand('latex-workshop.synctexto', (line: number, filePath: string) => extension.commander.synctexonref(line, filePath)),
        vscode.commands.registerCommand('latex-workshop.activate', () => undefined),
        vscode.commands.registerCommand('latex-workshop.citation', () => extension.commander.citation()),
        vscode.commands.registerCommand('latex-workshop.log', () => extension.commander.log()),
        vscode.commands.registerCommand('latex-workshop.compilerlog', () => extension.commander.log('compiler')),
        vscode.commands.registerCommand('latex-workshop.goto-section', (filePath: string, lineNumber: number) => extension.commander.gotoSection(filePath, lineNumber)),
        vscode.commands.registerCommand('latex-workshop.navigate-envpair', () => extension.commander.navigateToEnvPair()),
        vscode.commands.registerCommand('latex-workshop.onEnterKey', () => extension.commander.onEnterKey()),
        vscode.commands.registerCommand('latex-workshop.onAltEnterKey', () => extension.commander.onEnterKey('alt')),
        vscode.commands.registerCommand('latex-workshop.revealOutputDir', () => extension.commander.revealOutputDir()),

        vscode.commands.registerCommand('latex-workshop.promote-sectioning', () => extension.commander.shiftSectioningLevel('promote')),
        vscode.commands.registerCommand('latex-workshop.demote-sectioning', () => extension.commander.shiftSectioningLevel('demote')),
        vscode.commands.registerCommand('latex-workshop.select-section', () => extension.commander.selectSection()),

        vscode.commands.registerCommand('latex-workshop.openMathPreviewPanel', () => extension.commander.openMathPreviewPanel()),
        vscode.commands.registerCommand('latex-workshop.closeMathPreviewPanel', () => extension.commander.closeMathPreviewPanel()),
        vscode.commands.registerCommand('latex-workshop.toggleMathPreviewPanel', () => extension.commander.toggleMathPreviewPanel())
    )

}

function generateLatexWorkshopApi(extension: Extension, structureViewer: StructureTreeView) {
    return {
        realExtension:  process.env['LATEXWORKSHOP_CI'] ? {...extension, structureViewer} : undefined
    }
}

let extensionToDispose: Extension | undefined

// We should clean up file watchers and wokerpool pools.
// We have to call async dispose() through deactivate()
// since vscode.Disposable doesn't support async dispose().
// - https://github.com/microsoft/vscode/issues/114688#issuecomment-768253918
export function deactivate() {
    void vscode.commands.executeCommand('setContext', 'latex-workshop:enabled', false)
    return extensionToDispose?.dispose()
}

export function activate(context: vscode.ExtensionContext): ReturnType<typeof generateLatexWorkshopApi> {
    const extension = new Extension(context)
    extensionToDispose = extension
    void vscode.commands.executeCommand('setContext', 'latex-workshop:enabled', true)

    registerLatexWorkshopCommands(extension)
    const structureViewer = new StructureTreeView(extension)
    new ProvidersManager(extension)

    conflictExtensionCheck()

    return generateLatexWorkshopApi(extension, structureViewer)
}

export class Extension {
    readonly extensionContext: vscode.ExtensionContext
    readonly extensionRoot: string
    readonly logger: Logger
    readonly statusbaritem: LwStatusBarItem
    readonly eventBus: EventBus
    readonly commander: Commander
    readonly configuration: Configuration
    readonly manager: Manager
    readonly builder: Builder
    readonly viewer: Viewer
    readonly server: Server
    readonly locator: Locator
    readonly compilerLog: CompilerLog
    readonly utensilsParser: UtensilsParser
    readonly latexAstManager: LatexAstManager
    readonly bibtexAstManager: BibtexAstManager
    readonly completionUpdater: CompletionUpdater
    readonly completer: Completer
    readonly linter: Linter
    readonly envPair: EnvPair
    readonly section: Section
    readonly latexCommanderTreeView: LaTeXCommanderTreeView
    readonly snippetView: SnippetView
    readonly graphicsPreview: GraphicsPreview
    readonly mathPreview: MathPreview
    readonly mathPreviewPanel: MathPreviewPanel
    readonly duplicateLabels: DuplicateLabels
    readonly referenceStore: ReferenceStore
    readonly auxManager: AuxManager

    constructor(context: vscode.ExtensionContext) {
        this.extensionContext = context
        this.extensionRoot = context.extensionPath
        // We must create Logger, EventBus, Builder, and CompletionUpdater first.
        // Other classes may use them in their constructors.
        this.logger = new Logger(context.subscriptions)
        this.eventBus = new EventBus(this)
        this.addLogFundamentals()
        this.configuration = new Configuration(this)
        this.referenceStore = new ReferenceStore(this)
        this.auxManager = new AuxManager(this)
        this.builder = new Builder(this)
        this.completionUpdater = new CompletionUpdater(this)

        this.compilerLog = new CompilerLog(this)
        this.statusbaritem = new LwStatusBarItem(this)
        this.commander = new Commander(this)
        this.manager = new Manager(this)
        this.viewer = new Viewer(this)
        this.server = new Server(this)
        this.locator = new Locator(this)
        this.completer = new Completer(this)
        this.duplicateLabels = new DuplicateLabels(this)
        this.linter = new Linter(this)
        this.envPair = new EnvPair(this)
        this.section = new Section(this)
        this.latexCommanderTreeView = new LaTeXCommanderTreeView(this)
        this.snippetView = new SnippetView(this)
        this.utensilsParser = new UtensilsParser()
        this.latexAstManager = new LatexAstManager(this)
        this.bibtexAstManager = new BibtexAstManager(this)
        this.graphicsPreview = new GraphicsPreview(this)
        this.mathPreview = new MathPreview(this)
        this.mathPreviewPanel = new MathPreviewPanel(this)
        this.logger.info('LaTeX Workshop initialized.')
    }

    async dispose() {
        await this.utensilsParser.dispose()
        await this.mathPreview.dispose()
    }

    private addLogFundamentals() {
        this.logger.info('Initializing LaTeX Workshop.')
        this.logger.info(`Extension root: ${this.extensionRoot}`)
        this.logger.info(`$PATH: ${process.env.PATH}`)
        this.logger.info(`$SHELL: ${process.env.SHELL}`)
        this.logger.info(`$LANG: ${process.env.LANG}`)
        this.logger.info(`$LC_ALL: ${process.env.LC_ALL}`)
        this.logger.info(`process.platform: ${process.platform}`)
        this.logger.info(`process.arch: ${process.arch}`)
        this.logger.info(`vscode.env.appName: ${vscode.env.appName}`)
        this.logger.info(`vscode.env.remoteName: ${vscode.env.remoteName}`)
        this.logger.info(`vscode.env.uiKind: ${vscode.env.uiKind}`)
    }

}
