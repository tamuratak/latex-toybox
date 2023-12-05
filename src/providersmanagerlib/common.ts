import * as vscode from 'vscode'

import { LtInlayHintsProvider } from '../providers/inlayhint.js'
import { FileDecorationProvider } from '../providers/filedecoration.js'
import { SelectionRangeProvider } from '../providers/selection.js'
import { selectDocumentsWithId } from '../utils/selectdocument.js'
import { type MathPreviewPanel } from '../components/mathpreviewpanel.js'
import { AtSuggestionCompleter } from '../providers/atsuggestion.js'
import { inspectCompact } from '../utils/inspect.js'
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
import { SingleProviderManager } from './singleprovidermanager.js'


export function registerCommonProviders(extension: {
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
                return vscode.languages.registerSelectionRangeProvider({ language: 'latex' }, selectionRangeProvider)
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
                return vscode.languages.registerInlayHintsProvider({ language: 'latex' }, ltInlayHintsProvider)
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
