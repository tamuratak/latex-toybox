import './setupforweb.js'

import * as vscode from 'vscode'

import { Commander } from '../commander.js'
import { Logger } from '../components/logger.js'
import { Manager } from '../components/manager.js'
import { EnvPair } from '../components/envpair.js'
import { Section } from '../components/section.js'
import { UtensilsParser } from '../components/utensilsparser.js'
import { Configuration } from '../components/configuration.js'
import { EventBus } from '../components/eventbus.js'

import { Completer } from '../providers/completion.js'
import { DuplicateLabels } from '../components/duplicatelabels.js'
import { GraphicsPreview } from '../components/graphicspreview.js'
import { MathPreview } from '../components/mathpreview.js'
import { MathPreviewPanel } from '../components/mathpreviewpanel.js'
import { SnippetView } from '../components/snippetview.js'
import { ReferenceStore } from '../components/referencestore.js'
import { CompletionUpdater } from '../components/completionupdater.js'
import { BibtexAstManager, LatexAstManager } from '../components/astmanager.js'
import { AuxManager } from '../components/auxmanager.js'
import { registerProvidersOnWeb } from './registerprovidersonweb.js'
import { StructureTreeView } from '../components/structure.js'


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
        vscode.commands.registerCommand('latex-toybox.activate', () => undefined),
        vscode.commands.registerCommand('latex-toybox.citation', () => extension.commander.citation()),
        vscode.commands.registerCommand('latex-toybox.log', () => extension.commander.log()),
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

let extensionToDispose: ExtensionOnWeb | undefined

// We should clean up file watchers and wokerpool pools.
// We have to call async dispose() through deactivate()
// since vscode.Disposable doesn't support async dispose().
// - https://github.com/microsoft/vscode/issues/114688#issuecomment-768253918
export function deactivate() {
    void vscode.commands.executeCommand('setContext', 'latex-toybox:enabled', false)
    void vscode.commands.executeCommand('setContext', 'latex-toybox:web:enabled', false)
    return extensionToDispose?.dispose()
}

export function activate(context: vscode.ExtensionContext) {
    const extension = new ExtensionOnWeb(context)
    extensionToDispose = extension

    registerLatexToyboxCommands(extension)
    new StructureTreeView(extension)
    registerProvidersOnWeb(extension)

    conflictExtensionCheck()
    void vscode.commands.executeCommand('setContext', 'latex-toybox:enabled', true)
    void vscode.commands.executeCommand('setContext', 'latex-toybox:web:enabled', true)
}

export class ExtensionOnWeb {
    readonly extensionContext: vscode.ExtensionContext
    readonly extensionRoot: string
    readonly logger: Logger
    readonly eventBus: EventBus
    readonly commander: Commander
    readonly configuration: Configuration
    readonly manager: Manager
    readonly utensilsParser: UtensilsParser
    readonly latexAstManager: LatexAstManager
    readonly bibtexAstManager: BibtexAstManager
    readonly completionUpdater: CompletionUpdater
    readonly completer: Completer
    readonly envPair: EnvPair
    readonly section: Section
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
        this.completionUpdater = new CompletionUpdater(this)

        this.commander = new Commander({...this, builder: undefined, compilerLog: undefined, locator: undefined, viewer: undefined, texDoc: undefined })
        this.manager = new Manager({...this, viewer: undefined })
        this.completer = new Completer(this)
        this.duplicateLabels = new DuplicateLabels(this)
        this.envPair = new EnvPair(this)
        this.section = new Section(this)
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
        this.logger.info(`vscode.env.appName: ${vscode.env.appName}`)
        this.logger.info(`vscode.env.remoteName: ${vscode.env.remoteName}`)
        this.logger.info(`vscode.env.uiKind: ${vscode.env.uiKind}`)
    }

}
