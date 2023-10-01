import * as vscode from 'vscode'
import { LtInlayHintsProvider } from './providers/inlayhint'
import { FileDecorationProvider } from './providers/filedecoration'
import { SelectionRangeProvider } from './providers/selection'
import { selectDocumentsWithId } from './utils/selectdocument'
import { PdfViewerHookProvider } from './components/viewer'
import { HoverProvider } from './providers/hover'
import { DefinitionProvider } from './providers/definition'
import { ReferenceProvider } from './providers/reference'
import { RenameProvider } from './providers/rename'
import { BibtexCompleter } from './providers/bibtexcompletion'
import { FoldingProvider } from './providers/folding'
import { BibtexFormatterProvider } from './providers/bibtexformatter'
import type { Extension } from './main'
import { MathPreviewPanelSerializer } from './components/mathpreviewpanel'
import { AtSuggestionCompleter } from './providers/atsuggestion'
import { inspectCompact } from './utils/inspect'


abstract class SingleProviderManager implements vscode.Disposable {
    private disposable: vscode.Disposable | undefined
    private configDisposable: vscode.Disposable | undefined

    constructor() {
        if (this.isEnabled()) {
            this.disposable = this.register()
        }

        this.configDisposable = vscode.workspace.onDidChangeConfiguration((e) => {
            if (this.isAffected(e)) {
                if (this.isEnabled()) {
                    this.disposable?.dispose()
                    this.disposable = this.register()
                } else {
                    this.disposable?.dispose()
                    this.disposable = undefined
                }
            }
        })
    }

    dispose() {
        this.configDisposable?.dispose()
        this.configDisposable = undefined
        this.disposable?.dispose()
        this.disposable = undefined
    }

    protected abstract isEnabled(): boolean

    protected abstract isAffected(e: vscode.ConfigurationChangeEvent): boolean

    protected abstract register(): vscode.Disposable

}

export class ProvidersManager {

    constructor(extension: Extension){
        this.registerProviders(extension, extension.extensionContext)

        const latexDoctexSelector = selectDocumentsWithId(['latex', 'latex-expl3', 'doctex'])
        const selectionRangeProvider = new SelectionRangeProvider(extension)
        const ltInlayHintsProvider = new LtInlayHintsProvider(extension)
        const fileDecorationProvider = new FileDecorationProvider(extension)
        extension.extensionContext.subscriptions.push(
            new class extends SingleProviderManager {
                isEnabled(): boolean {
                    return true
                }
                isAffected(e: vscode.ConfigurationChangeEvent): boolean {
                    return e.affectsConfiguration('latex-toybox.intellisense.triggers.latex')
                }
                register(): vscode.Disposable {
                    const configuration = vscode.workspace.getConfiguration('latex-toybox')
                    const userTriggersLatex = configuration.get('intellisense.triggers.latex', ['{'])
                    const latexTriggers = ['\\', ','].concat(userTriggersLatex)
                    extension.logger.info(`Trigger characters for intellisense of LaTeX documents: ${inspectCompact(latexTriggers)}`)
                    return vscode.languages.registerCompletionItemProvider(latexDoctexSelector, extension.completer, ...latexTriggers)
                }
            },
            new class extends SingleProviderManager {
                isEnabled(): boolean {
                    const configuration = vscode.workspace.getConfiguration('latex-toybox')
                    return configuration.get<string>('intellisense.atSuggestion.trigger.latex', '@') !== ''
                }
                isAffected(e: vscode.ConfigurationChangeEvent): boolean {
                    return e.affectsConfiguration('latex-toybox.intellisense.atSuggestion.trigger.latex')
                }
                register(): vscode.Disposable {
                    const configuration = vscode.workspace.getConfiguration('latex-toybox')
                    const atSuggestionLatexTrigger = configuration.get('intellisense.atSuggestion.trigger.latex', '@')
                    const atSuggestionCompleter = new AtSuggestionCompleter(extension, atSuggestionLatexTrigger)
                    return vscode.languages.registerCompletionItemProvider(
                        latexDoctexSelector,
                        atSuggestionCompleter,
                        atSuggestionLatexTrigger
                    )
                }
            },
            new class extends SingleProviderManager {
                isEnabled(): boolean {
                    const configuration = vscode.workspace.getConfiguration('latex-toybox')
                    return configuration.get('selection.smart.latex.enabled', true)
                }
                isAffected(e: vscode.ConfigurationChangeEvent): boolean {
                    return e.affectsConfiguration('latex-toybox.selection.smart.latex.enabled')
                }
                register(): vscode.Disposable {
                    return vscode.languages.registerSelectionRangeProvider({language: 'latex'}, selectionRangeProvider)
                }
            },
            new class extends SingleProviderManager {
                isEnabled(): boolean {
                    const configuration = vscode.workspace.getConfiguration('latex-toybox')
                    return configuration.get('inlayHints.enabled', true)
                }
                isAffected(e: vscode.ConfigurationChangeEvent): boolean {
                    return e.affectsConfiguration('latex-toybox.inlayHints.enabled')
                }
                register(): vscode.Disposable {
                    return vscode.languages.registerInlayHintsProvider({language: 'latex'}, ltInlayHintsProvider)
                }
            },
            new class extends SingleProviderManager {
                isEnabled(): boolean {
                    const configuration = vscode.workspace.getConfiguration('latex-toybox')
                    const decoration = configuration.get('decoration.rootFile', '')
                    const subdecoration = configuration.get('decoration.rootSubFile', '')
                    return decoration !== '' || subdecoration !== ''
                }
                isAffected(e: vscode.ConfigurationChangeEvent): boolean {
                    return e.affectsConfiguration('latex-toybox.decoration')
                }
                register(): vscode.Disposable {
                    return vscode.window.registerFileDecorationProvider(fileDecorationProvider)
                }
            }
        )
    }

    private registerProviders(extension: Extension, context: vscode.ExtensionContext) {
        const latexSelector = selectDocumentsWithId(['latex', 'latex-expl3'])
        const bibtexFormatter = new BibtexFormatterProvider(extension)

        context.subscriptions.push(
            vscode.languages.registerDocumentFormattingEditProvider({ scheme: 'file', language: 'bibtex'}, bibtexFormatter),
            vscode.languages.registerDocumentRangeFormattingEditProvider({ scheme: 'file', language: 'bibtex'}, bibtexFormatter)
        )

        context.subscriptions.push(
            vscode.window.registerWebviewPanelSerializer('latex-toybox-pdf', extension.viewer.pdfViewerPanelSerializer),
            vscode.window.registerCustomEditorProvider('latex-toybox-pdf-hook', new PdfViewerHookProvider(extension), {supportsMultipleEditorsPerDocument: true}),
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
            vscode.languages.registerCompletionItemProvider({ scheme: 'file', language: 'tex'}, extension.completer, '\\', '{'),
            vscode.languages.registerCompletionItemProvider({ scheme: 'file', language: 'bibtex'}, new BibtexCompleter(extension), '@')
        )

        context.subscriptions.push(
            vscode.languages.registerFoldingRangeProvider(latexSelector, new FoldingProvider(extension)),
        )

        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(
                'latex-toybox-snippet-view',
                extension.snippetView.snippetViewProvider,
                {webviewOptions: {retainContextWhenHidden: true}}
            )
        )
    }

}
