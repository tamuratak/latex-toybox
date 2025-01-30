import * as vscode from 'vscode'
import * as path from 'node:path'

import type { PanelRequest, PdfViewerState } from 'latex-toybox-protocol-types'
import { escapeHtml, sleep } from '../../utils/utils.js'
import type { PdfViewerManagerService } from './pdfviewermanager.js'
import { getNonce } from '../../utils/getnonce.js'
import * as lwfs from '../../lib/lwfs/lwfs.js'
import { encodePathWithPrefix } from '../../utils/encodepdffilepath.js'
import { EventBus } from '../eventbus.js'
import { Logger } from '../logger.js'
import { Server } from '../server.js'
import { inspectCompact } from '../../utils/inspect.js'

export const pdfViewerPanelViewType = 'latex-toybox-pdf'

export class PdfViewerPanel {
    readonly webviewPanel: vscode.WebviewPanel
    readonly pdfFileUri: vscode.Uri
    #state: PdfViewerState | undefined

    constructor(
        private readonly extension: {
            readonly extensionRoot: string,
            readonly eventBus: EventBus,
            readonly logger: Logger,
            readonly server: Server
        },
        pdfFileUri: vscode.Uri,
        panel: vscode.WebviewPanel
    ) {
        this.pdfFileUri = pdfFileUri
        this.webviewPanel = panel
        panel.webview.onDidReceiveMessage((msg: PanelRequest) => {
            switch(msg.type) {
                case 'state': {
                    this.#state = msg.state
                    void this.extension.eventBus.pdfViewerStatusChanged.fire(msg.state)
                    break
                }
                default: {
                    break
                }
            }
        })
    }

    dispose() {
        this.webviewPanel.dispose()
    }

    get state() {
        return this.#state
    }

}

export class PdfViewerPanelSerializer implements vscode.WebviewPanelSerializer {
    private readonly panelService: PdfViewerPanelService
    private readonly managerService: PdfViewerManagerService

    constructor(
        private readonly extension: {
            readonly extensionRoot: string,
            readonly eventBus: EventBus,
            readonly logger: Logger,
            readonly server: Server
        },
        panelService: PdfViewerPanelService,
        service: PdfViewerManagerService
    ) {
        this.panelService = panelService
        this.managerService = service
    }

    async deserializeWebviewPanel(panel: vscode.WebviewPanel, argState: {state: PdfViewerState}): Promise<void> {
        // We should update localResourceRoots for the case that the extension version was updated and the extension directory changed.
        // https://github.com/microsoft/vscode/pull/114661#issuecomment-764994131
        const resourceFolder = path.join(this.extension.extensionRoot, 'resources', 'pdfviewerpanel')
        panel.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.file(resourceFolder)]
        }
        await this.extension.server.serverStarted
        this.extension.logger.info(`Restoring the PDF viewer at the column ${panel.viewColumn} from the state: ${inspectCompact(argState)}`)
        const state = argState.state
        let pdfFileUri: vscode.Uri | undefined
        if (state.path) {
            pdfFileUri = vscode.Uri.file(state.path)
        } else if (state.pdfFileUri) {
            pdfFileUri = vscode.Uri.parse(state.pdfFileUri, true)
        }
        if (!pdfFileUri) {
            this.extension.logger.error('Error of restoring PDF viewer: the path of PDF file is undefined.')
            panel.webview.html = '<!DOCTYPE html> <html lang="en"><meta charset="utf-8"/><br>The path of PDF file is undefined.</html>'
            return
        }
        if (! await lwfs.exists(pdfFileUri)) {
            const s = escapeHtml(pdfFileUri.toString())
            this.extension.logger.error(`Error of restoring PDF viewer: file not found ${pdfFileUri.toString(true)}.`)
            panel.webview.html = `<!DOCTYPE html> <html lang="en"><meta charset="utf-8"/><br>File not found: ${s}</html>`
            return
        }
        panel.webview.html = await this.panelService.getPDFViewerContent(pdfFileUri, panel.webview)
        const pdfPanel = new PdfViewerPanel(this.extension, pdfFileUri, panel)
        this.managerService.initiatePdfViewerPanel(pdfPanel)
        return
    }
}

export class PdfViewerPanelService {
    private alreadyOpened = false

    constructor(private readonly extension: ConstructorParameters<typeof PdfViewerPanel>[0]) { }

    private async tweakForCodespaces(url: vscode.Uri) {
        if (this.alreadyOpened) {
            return
        }
        if (vscode.env.remoteName === 'codespaces' && vscode.env.uiKind === vscode.UIKind.Web) {
            const configuration = vscode.workspace.getConfiguration('latex-toybox')
            const delay = configuration.get('codespaces.portforwarding.openDelay', 20000)
            // We have to open the url in a browser tab for the authentication of port forwarding through githubpreview.dev.
            await vscode.env.openExternal(url)
            await sleep(delay)
        }
        this.alreadyOpened = true
    }

    async createPdfViewerPanel(pdfFileUri: vscode.Uri, viewColumn: vscode.ViewColumn): Promise<PdfViewerPanel> {
        await this.extension.server.serverStarted
        const panel = vscode.window.createWebviewPanel(pdfViewerPanelViewType, path.basename(pdfFileUri.path), viewColumn, {
            enableScripts: true,
            retainContextWhenHidden: true
        })
        const htmlContent = await this.getPDFViewerContent(pdfFileUri, panel.webview)
        panel.webview.html = htmlContent
        const pdfPanel = new PdfViewerPanel(this.extension, pdfFileUri, panel)
        return pdfPanel
    }

    private getKeyboardEventConfig(): boolean {
        const configuration = vscode.workspace.getConfiguration('latex-toybox')
        const setting: 'auto' | 'force' | 'never' = configuration.get('view.pdf.keyboardEvent', 'auto')
        if (setting === 'auto') {
            return true
        } else if (setting === 'force') {
            return true
        } else {
            return false
        }
    }

    /**
     * Returns the HTML content of the internal PDF viewer.
     *
     * @param pdfFile The path of a PDF file to be opened.
     */
    async getPDFViewerContent(pdfFile: vscode.Uri, webview: vscode.Webview): Promise<string> {
        const serverPort = this.extension.server.port
        // viewer/viewer.js automatically requests the file to server.ts, and server.ts decodes the encoded path of PDF file.
        let origUrl = `http://127.0.0.1:${serverPort}/viewer.html?file=${encodePathWithPrefix(pdfFile)}`
        if (process.env['LATEXTOYBOX_DEBUG']) {
            origUrl += '&debug=true'
        }
        const url = await vscode.env.asExternalUri(vscode.Uri.parse(origUrl, true))
        const iframeSrcOrigin = `${url.scheme}://${url.authority}`
        const iframeSrcUrl = url.toString(true)
        await this.tweakForCodespaces(url)
        this.extension.logger.info(`The internal PDF viewer url: ${iframeSrcUrl}`)
        const rebroadcast: boolean = this.getKeyboardEventConfig()
        const jsPath = vscode.Uri.file(path.join(this.extension.extensionRoot, './resources/pdfviewerpanel/pdfviewerpanel.js'))
        const jsPathSrc = webview.asWebviewUri(jsPath)
        const nonce = getNonce()
        return `
<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; frame-src ${iframeSrcOrigin}; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
<script nonce="${nonce}">
var iframeSrcOrigin = '${iframeSrcOrigin}';
var rebroadcast = ${rebroadcast};
</script>
<script src="${jsPathSrc}" nonce="${nonce}"></script>
</head>
<body>
<iframe id="preview-panel" class="preview-panel" src="${iframeSrcUrl}" style="position:absolute; border: none; left: 0; top: 0; width: 100%; height: 100%;">
</iframe>
</body>
</html>
`
    }

}
