import * as vscode from 'vscode'
import * as process from 'node:process'

import { Commander } from './commander.js'
import { LaTeXCommanderTreeView } from './components/commander.js'
import { Logger } from './components/logger.js'
import { Manager } from './components/manager.js'
import { Builder } from './components/builder.js'
import { Viewer } from './components/viewer.js'
import { Server } from './components/server.js'
import { Locator } from './components/locator.js'
import { Linter } from './components/linter.js'
import { EnvPair } from './components/envpair.js'
import { Section } from './components/section.js'
import { UtensilsParser } from './components/utensilsparser.js'
import { Configuration } from './components/configuration.js'
import { EventBus } from './components/eventbus.js'

import { Completer } from './providers/completion.js'
import { DuplicateLabels } from './components/duplicatelabels.js'
import { GraphicsPreview } from './components/graphicspreview.js'
import { MathPreview } from './components/mathpreview.js'
import { MathPreviewPanel } from './components/mathpreviewpanel.js'
import { SnippetView } from './components/snippetview.js'
import { ReferenceStore } from './components/referencestore.js'
import { CompletionUpdater } from './components/completionupdater.js'
import { LwStatusBarItem } from './components/statusbaritem.js'
import { CompilerLog } from './components/compilerlog.js'
import { BibtexAstManager, LatexAstManager } from './components/astmanager.js'
import { AuxManager } from './components/auxmanager.js'
import { registerProviders } from './registerproviders.js'
import { StructureTreeView } from './components/structure.js'
import { TeXDoc } from './components/texdoc.js'


function conflictExtensionCheck() {
    function check(extensionID: string, name: string, suggestion: string) {
        if (vscode.extensions.getExtension(extensionID) !== undefined) {
            void vscode.window.showWarningMessage(`LaTeX Toybox is incompatible with extension "${name}". ${suggestion}`)
        }
    }
    check('tomoki1207.pdf', 'vscode-pdf', 'Please consider disabling either extension.')
}

function registerLatexToyboxCommands(
    extension: {
        readonly extensionContext: vscode.ExtensionContext,
        readonly commander: Commander
    }
) {

    extension.extensionContext.subscriptions.push(
        vscode.commands.registerCommand('latex-toybox.saveWithoutBuilding', () => extension.commander.saveWithoutBuilding()),
        vscode.commands.registerCommand('latex-toybox.build', () => extension.commander.build()),
        vscode.commands.registerCommand('latex-toybox.recipes', (recipe: string | undefined) => extension.commander.recipes(recipe)),
        vscode.commands.registerCommand('latex-toybox.view', (mode: 'tab' | 'browser' | 'external' | vscode.Uri | undefined) => extension.commander.view(mode)),
        vscode.commands.registerCommand('latex-toybox.refresh-viewer', () => extension.commander.refresh()),
        vscode.commands.registerCommand('latex-toybox.tab', () => extension.commander.view('tab')),
        vscode.commands.registerCommand('latex-toybox.viewInBrowser', () => extension.commander.view('browser')),
        vscode.commands.registerCommand('latex-toybox.viewExternal', () => extension.commander.view('external')),
        vscode.commands.registerCommand('latex-toybox.kill', () => extension.commander.kill()),
        vscode.commands.registerCommand('latex-toybox.synctex', () => extension.commander.synctex()),
        vscode.commands.registerCommand('latex-toybox.texdoc', (pkg: string | undefined) => extension.commander.texdoc(pkg)),
        vscode.commands.registerCommand('latex-toybox.texdocUsepackages', () => extension.commander.texdocUsepackages()),
        vscode.commands.registerCommand('latex-toybox.synctexto', (line: number, filePath: string) => extension.commander.synctexonref(line, filePath)),
        vscode.commands.registerCommand('latex-toybox.activate', () => undefined),
        vscode.commands.registerCommand('latex-toybox.citation', () => extension.commander.citation()),
        vscode.commands.registerCommand('latex-toybox.log', () => extension.commander.log()),
        vscode.commands.registerCommand('latex-toybox.compilerlog', () => extension.commander.log('compiler')),
        vscode.commands.registerCommand('latex-toybox.goto-section', (filePath: string, lineNumber: number) => extension.commander.gotoSection(filePath, lineNumber)),
        vscode.commands.registerCommand('latex-toybox.navigate-envpair', () => extension.commander.navigateToEnvPair()),
        vscode.commands.registerCommand('latex-toybox.onEnterKey', () => extension.commander.onEnterKey()),
        vscode.commands.registerCommand('latex-toybox.onAltEnterKey', () => extension.commander.onEnterKey('alt')),
        vscode.commands.registerCommand('latex-toybox.revealOutputDir', () => extension.commander.revealOutputDir()),

        vscode.commands.registerCommand('latex-toybox.promote-sectioning', () => extension.commander.shiftSectioningLevel('promote')),
        vscode.commands.registerCommand('latex-toybox.demote-sectioning', () => extension.commander.shiftSectioningLevel('demote')),
        vscode.commands.registerCommand('latex-toybox.select-section', () => extension.commander.selectSection()),

        vscode.commands.registerCommand('latex-toybox.openMathPreviewPanel', () => extension.commander.openMathPreviewPanel()),
        vscode.commands.registerCommand('latex-toybox.closeMathPreviewPanel', () => extension.commander.closeMathPreviewPanel()),
        vscode.commands.registerCommand('latex-toybox.toggleMathPreviewPanel', () => extension.commander.toggleMathPreviewPanel())
    )

}

function generateLatexToyboxApi(extension: Extension, structureViewer: StructureTreeView) {
    return {
        realExtension:  process.env['LATEXTOYBOX_CI'] ? {...extension, structureViewer} : undefined
    }
}

let extensionToDispose: Extension | undefined

// We should clean up file watchers and wokerpool pools.
// We have to call async dispose() through deactivate()
// since vscode.Disposable doesn't support async dispose().
// - https://github.com/microsoft/vscode/issues/114688#issuecomment-768253918
export function deactivate() {
    void vscode.commands.executeCommand('setContext', 'latex-toybox:enabled', false)
    void vscode.commands.executeCommand('setContext', 'latex-toybox:web:enabled', false)
    return extensionToDispose?.dispose()
}

export function activate(context: vscode.ExtensionContext): ReturnType<typeof generateLatexToyboxApi> {
    const extension = new Extension(context)
    extensionToDispose = extension

    registerLatexToyboxCommands(extension)
    const structureViewer = new StructureTreeView(extension)
    registerProviders(extension)

    conflictExtensionCheck()
    void vscode.commands.executeCommand('setContext', 'latex-toybox:enabled', true)
    void vscode.commands.executeCommand('setContext', 'latex-toybox:web:enabled', true)

    return generateLatexToyboxApi(extension, structureViewer)
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
    readonly texDoc: TeXDoc

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
        this.texDoc = new TeXDoc(this)
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
        this.logger.info('LaTeX Toybox initialized.')
    }

    async dispose() {
        await this.utensilsParser.dispose()
        await this.mathPreview.dispose()
    }

    private addLogFundamentals() {
        this.logger.info('Initializing LaTeX Toybox.')
        this.logger.info(`Extension root: ${this.extensionRoot}`)
        this.logger.info(`$PATH: ${process.env['PATH']}`)
        this.logger.info(`$SHELL: ${process.env['SHELL']}`)
        this.logger.info(`$LANG: ${process.env['LANG']}`)
        this.logger.info(`$LC_ALL: ${process.env['LC_ALL']}`)
        this.logger.info(`process.platform: ${process.platform}`)
        this.logger.info(`process.arch: ${process.arch}`)
        this.logger.info(`vscode.env.appName: ${vscode.env.appName}`)
        this.logger.info(`vscode.env.remoteName: ${vscode.env.remoteName}`)
        this.logger.info(`vscode.env.uiKind: ${vscode.env.uiKind}`)
    }

}
