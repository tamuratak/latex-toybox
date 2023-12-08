import * as vscode from 'vscode'
import { selectDocumentsWithId } from '../utils/selectdocument.js'
import { HoverProvider } from '../providers/hover.js'
import { DefinitionProvider } from '../providers/definition.js'
import { ReferenceProvider } from '../providers/reference.js'
import { RenameProvider } from '../providers/rename.js'
import { BibtexCompleter } from '../providers/bibtexcompletion.js'
import { FoldingProvider } from '../providers/folding.js'
import { BibtexFormatterProvider } from '../providers/bibtexformatter.js'
import { type MathPreviewPanel, MathPreviewPanelSerializer } from '../components/mathpreviewpanel.js'
import type { BibtexAstManager, LatexAstManager } from '../components/astmanager.js'
import type { Logger } from '../components/logger.js'
import type { GraphicsPreview } from '../components/graphicspreview.js'
import type { Manager } from '../components/manager.js'
import type { MathPreview } from '../components/mathpreview.js'
import type { Completer } from '../providers/completion.js'
import type { EventBus } from '../components/eventbus.js'
import type { Commander } from '../commander.js'
import type { SnippetView } from '../components/snippetview.js'
import type { ReferenceStore } from '../components/referencestore.js'
import type { AuxManager } from '../components/auxmanager.js'
import { registerCommonProviders } from '../registerproviderslib/common.js'


export function registerProvidersOnWeb(
    extension: {
        readonly extensionContext: vscode.ExtensionContext,
        readonly extensionRoot: string,
        readonly logger: Logger,
        readonly eventBus: EventBus,
        readonly commander: Commander,
        readonly manager: Manager,
        readonly latexAstManager: LatexAstManager,
        readonly bibtexAstManager: BibtexAstManager,
        readonly completer: Completer,
        readonly snippetView: SnippetView,
        readonly graphicsPreview: GraphicsPreview,
        readonly mathPreview: MathPreview,
        readonly mathPreviewPanel: MathPreviewPanel,
        readonly referenceStore: ReferenceStore,
        readonly auxManager: AuxManager
}) {
    registerCommonProviders(extension)
    const context = extension.extensionContext
    const latexSelector = selectDocumentsWithId(['latex', 'latex-expl3'])
    const bibtexFormatter = new BibtexFormatterProvider(extension)

    context.subscriptions.push(
        vscode.languages.registerDocumentFormattingEditProvider({ scheme: 'file', language: 'bibtex' }, bibtexFormatter),
        vscode.languages.registerDocumentRangeFormattingEditProvider({ scheme: 'file', language: 'bibtex' }, bibtexFormatter)
    )

    context.subscriptions.push(
        vscode.window.registerWebviewPanelSerializer('latex-toybox-mathpreview', new MathPreviewPanelSerializer(extension))
    )

    context.subscriptions.push(
        vscode.languages.registerHoverProvider(latexSelector, new HoverProvider(extension)),
        vscode.languages.registerDefinitionProvider(latexSelector, new DefinitionProvider(extension))
    )

    context.subscriptions.push(
        vscode.languages.registerReferenceProvider(latexSelector, new ReferenceProvider(extension)),
        vscode.languages.registerRenameProvider(latexSelector, new RenameProvider(extension)),
    )

    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider({ scheme: 'file', language: 'tex' }, extension.completer, '\\', '{'),
        vscode.languages.registerCompletionItemProvider({ scheme: 'file', language: 'bibtex' }, new BibtexCompleter(extension), '@')
    )

    context.subscriptions.push(
        vscode.languages.registerFoldingRangeProvider(latexSelector, new FoldingProvider(extension)),
    )

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'latex-toybox-snippet-view',
            extension.snippetView.snippetViewProvider,
            { webviewOptions: { retainContextWhenHidden: true } }
        )
    )
}
