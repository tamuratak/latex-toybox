import * as vscode from 'vscode'
import type ws from 'ws'

import { toKey } from '../../utils/tokey.js'
import type { Client } from './client.js'
import type { PdfViewerPanel } from './pdfviewerpanel.js'
import type { Manager } from '../manager.js'
import type { Logger } from '../logger.js'
import { inspectCompact } from '../../utils/inspect.js'

interface CurrentSessionClientKeys {
    sessionId: string
    clientKeys: string[]
}

export class PdfViewerManagerService {
    private readonly webviewPanelMap = new Map<string, Set<PdfViewerPanel>>()
    private readonly clientSetKey = 'pdfviewer.clientset'
    readonly clientMap = new Map<string, Set<Client>>()

    constructor(private readonly extension: {
        readonly extensionContext: vscode.ExtensionContext,
        readonly logger: Logger,
        readonly manager: Manager
    }) {
        const currentSessionClientKeys = this.extension.extensionContext.workspaceState.get<CurrentSessionClientKeys>(this.clientSetKey)
        if (currentSessionClientKeys) {
            const { sessionId, clientKeys } = currentSessionClientKeys
            if (sessionId === vscode.env.sessionId) {
                this.extension.logger.info(`Restoring the client set from the current session: ${inspectCompact(currentSessionClientKeys)}`)
                clientKeys.forEach(key => {
                    this.createClientSetFromKey(key)
                })
            }
        }
    }

    dispose() {
        this.webviewPanelMap.forEach(panelSet => {
            panelSet.forEach(panel => {
                panel.dispose()
            })
        })
    }

    /**
     * Make the manager treat the PDF file as an output of a LaTeX file.
     * @param pdfFileUri The URI of a PDF file.
     */
    createClientSet(pdfFileUri: vscode.Uri): void {
        const key = toKey(pdfFileUri)
        this.createClientSetFromKey(key)
        const currentSessionClientKeys = { sessionId: vscode.env.sessionId, clientKeys: Array.from(this.clientMap.keys()) }
        void this.extension.extensionContext.workspaceState.update(this.clientSetKey, currentSessionClientKeys)
    }

    private createClientSetFromKey(key: string): void {
        if (!this.clientMap.has(key)) {
            this.clientMap.set(key, new Set())
        }
        if (!this.webviewPanelMap.has(key)) {
            this.webviewPanelMap.set(key, new Set())
        }
    }

    /**
     * Returns the set of client instances of a PDF file.
     * Returns `undefined` if the viewer have not recieved any request for the PDF file.
     *
     * @param pdfFileUri The path of a PDF file.
     */
    getClientSet(pdfFileUri: vscode.Uri): Set<Client> | undefined {
        return this.clientMap.get(toKey(pdfFileUri))
    }

    getPanelSet(pdfFileUri: vscode.Uri): Set<PdfViewerPanel> | undefined {
        return this.webviewPanelMap.get(toKey(pdfFileUri))
    }

    findClient(pdfFileUri: vscode.Uri, websocket: ws): Client | undefined {
        const clientSet = this.getClientSet(pdfFileUri)
        if (clientSet === undefined) {
            return
        }
        for (const client of clientSet) {
            if (client.websocket === websocket) {
                return client
            }
        }
        return
    }

    initiatePdfViewerPanel(pdfPanel: PdfViewerPanel): PdfViewerPanel | undefined {
        const pdfFileUri = pdfPanel.pdfFileUri
        this.extension.manager.watchPdfFile(pdfFileUri)
        this.createClientSet(pdfFileUri)
        const panelSet = this.getPanelSet(pdfFileUri)
        if (!panelSet) {
            return
        }
        panelSet.add(pdfPanel)
        pdfPanel.webviewPanel.onDidDispose(() => {
            panelSet.delete(pdfPanel)
        })
        return pdfPanel
    }
}
