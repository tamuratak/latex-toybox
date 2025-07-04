import { latexParser } from 'latex-utensils'
import * as vscode from 'vscode'
import type { Event, InlayHintsProvider, Range, TextDocument } from 'vscode'
import { EventEmitter, InlayHint } from 'vscode'
import { toVscodePosition, toVscodeRange } from '../utils/utensils.js'
import type { AuxManager } from '../components/auxmanager.js'
import type { LatexAstManager } from '../components/astmanager.js'
import type { Manager } from '../components/manager.js'
import type { EventBus } from '../components/eventbus.js'
import { toKey } from '../utils/tokey.js'


export class LtInlayHintsProvider implements InlayHintsProvider {
    private readonly eventEmitter = new EventEmitter<void>()
    readonly onDidChangeInlayHints: Event<void>
    private prevResult: { hints: vscode.InlayHint[], uri: string } = { hints: [], uri: '' }

    constructor(private readonly extension: {
        readonly extensionContext: vscode.ExtensionContext,
        readonly auxManager: AuxManager,
        readonly eventBus: EventBus,
        readonly latexAstManager: LatexAstManager,
        readonly manager: Manager
    }) {
        this.onDidChangeInlayHints = this.eventEmitter.event
        extension.eventBus.auxUpdated.event(() => {
            this.eventEmitter.fire()
        })
        extension.extensionContext.subscriptions.push(
            this.eventEmitter
        )
    }

    async provideInlayHints(document: TextDocument, range: Range) {
        const configuration = vscode.workspace.getConfiguration('latex-toybox', document)
        const enabled = configuration.get('inlayHints.enabled', true)
        if (!enabled) {
            return []
        }
        let prevHints: vscode.InlayHint[] = []
        if (this.prevResult.uri === toKey(document.uri)) {
            prevHints = this.prevResult.hints
        }
        const ast = await this.extension.latexAstManager.getDocAst(document)
        const rootFile = this.extension.manager.rootFile
        if (!ast || !rootFile) {
            return prevHints
        }
        const auxStore = this.extension.auxManager.getAuxStore(rootFile)
        if (!auxStore) {
            return prevHints
        }
        const labelNodes = latexParser.findAll(
            ast.content,
            (node): node is latexParser.LabelCommand => {
                if (node.location) {
                    const nodeRange = toVscodeRange(node.location)
                    if (range.contains(nodeRange)) {
                        return latexParser.isLabelCommand(node)
                    }
                }
                return false
            }
        )
        const result: InlayHint[] = []
        for (const nodeResult of labelNodes) {
            const node = nodeResult.node
            const labelPosArray = auxStore.labelsMap.get(node.label)
            if (!labelPosArray || labelPosArray.length > 1) {
                continue
            }
            const labelEntry = labelPosArray[0]
            const hint = new InlayHint(toVscodePosition(node.location.end), '(' + labelEntry.refNumber + ')')
            result.push(hint)
        }
        this.prevResult = { hints: result, uri: toKey(document.uri) }
        return result
    }

}
