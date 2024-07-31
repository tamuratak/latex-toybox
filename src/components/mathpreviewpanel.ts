import * as vscode from 'vscode'
import * as path from 'node:path'
import type { MathPreview, TexMathEnv } from './mathpreview.js'
import { openWebviewPanel } from '../utils/webview.js'
import { hasTexId } from '../utils/hastexid.js'
import type { Logger } from './logger.js'


interface UpdateEvent {
    type: 'selection',
    event: vscode.TextEditorSelectionChangeEvent
}

function resourcesFolder(extensionRoot: string) {
    const folder = path.join(extensionRoot, 'resources', 'mathpreviewpanel')
    return vscode.Uri.file(folder)
}

export class MathPreviewPanelSerializer implements vscode.WebviewPanelSerializer {

    constructor(private readonly extension: {
        readonly extensionRoot: string,
        readonly logger: Logger,
        readonly mathPreviewPanel: MathPreviewPanel
    }) { }

    deserializeWebviewPanel(panel: vscode.WebviewPanel) {
        this.extension.mathPreviewPanel.initializePanel(panel)
        // We should update localResourceRoots for the case that the extension version was updated and the extension directory changed.
        // https://github.com/microsoft/vscode/pull/114661#issuecomment-764994131
        panel.webview.options = {
            enableScripts: true,
            localResourceRoots: [resourcesFolder(this.extension.extensionRoot)]
        }
        panel.webview.html = this.extension.mathPreviewPanel.getHtml(panel.webview)
        this.extension.logger.info('Math preview panel: restored')
        return Promise.resolve()
    }

}

export class MathPreviewPanel {
    private panel: vscode.WebviewPanel | undefined
    private prevDocumentUri: string | undefined
    private prevCursorPosition: vscode.Position | undefined
    private prevNewCommands: string | undefined
    private needCursor: boolean

    constructor(private readonly extension: {
        readonly extensionContext: vscode.ExtensionContext,
        readonly extensionRoot: string,
        readonly logger: Logger,
        readonly mathPreview: MathPreview
    }) {
        const configuration = vscode.workspace.getConfiguration('latex-toybox')
        this.needCursor = configuration.get('mathpreviewpanel.cursor.enabled', false)
        extension.extensionContext.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration((e) => {
                if (e.affectsConfiguration('latex-toybox.mathpreviewpanel.cursor.enabled')) {
                    const conf = vscode.workspace.getConfiguration('latex-toybox')
                    this.needCursor = conf.get('mathpreviewpanel.cursor.enabled', false)
                }
            }),
            new vscode.Disposable(() => void this.panel?.dispose())
        )
    }

    private get mathPreview() {
        return this.extension.mathPreview
    }

    async open() {
        const activeDocument = vscode.window.activeTextEditor?.document
        if (this.panel) {
            if (!this.panel.visible) {
                this.panel.reveal(undefined, true)
            }
            return
        }
        this.mathPreview.getColor()
        const panel = vscode.window.createWebviewPanel(
            'latex-toybox-mathpreview',
            'Math Preview',
            { viewColumn: vscode.ViewColumn.Active, preserveFocus: true },
            {
                enableScripts: true,
                localResourceRoots: [resourcesFolder(this.extension.extensionRoot)],
                retainContextWhenHidden: true
            }
        )
        this.initializePanel(panel)
        panel.webview.html = this.getHtml(panel.webview)
        const configuration = vscode.workspace.getConfiguration('latex-toybox')
        const editorGroup = configuration.get('mathpreviewpanel.editorGroup') as string
        if (activeDocument) {
            await openWebviewPanel(panel, editorGroup, activeDocument)
        }
        this.extension.logger.info('Math preview panel: opened')
    }

    initializePanel(panel: vscode.WebviewPanel) {
        let timeout: NodeJS.Timeout | undefined
        const disposable = vscode.Disposable.from(
            vscode.workspace.onDidChangeTextDocument(() => {
                if (timeout) {
                    clearTimeout(timeout)
                    timeout = undefined
                }
                timeout = setTimeout(() => {
                    void this.update()
                }, 200)

            }),
            vscode.window.onDidChangeTextEditorSelection((event) => {
                if (timeout) {
                    clearTimeout(timeout)
                    timeout = undefined
                }
                void this.update({type: 'selection', event})
            })
        )
        this.panel = panel
        panel.onDidDispose(() => {
            disposable.dispose()
            this.clearCache()
            this.panel = undefined
            this.extension.logger.info('Math preview panel: disposed')
        })
        panel.onDidChangeViewState((ev) => {
            if (ev.webviewPanel.visible) {
                void this.update()
            }
        })
        panel.webview.onDidReceiveMessage(() => {
            this.extension.logger.info('Math preview panel: initialized')
            void this.update()
        })
    }

    close() {
        this.panel?.dispose()
        this.panel = undefined
        this.clearCache()
        this.extension.logger.info('Math preview panel: closed')
    }

    toggle() {
        if (this.panel) {
            this.close()
        } else {
            void this.open()
        }
    }

    private clearCache() {
        this.prevDocumentUri = undefined
        this.prevCursorPosition = undefined
        this.prevNewCommands = undefined
    }

    getHtml(webview: vscode.Webview) {
        const jsPath = vscode.Uri.file(path.join(this.extension.extensionRoot, './resources/mathpreviewpanel/mathpreview.js'))
        const jsPathSrc = webview.asWebviewUri(jsPath)
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; script-src ${webview.cspSource}; img-src data:; style-src 'unsafe-inline';">
            <meta charset="UTF-8">
            <style>
                body {
                    padding: 0;
                    margin: 0;
                }
                #math {
                    padding-top: 35px;
                    padding-left: 50px;
                }
            </style>
            <script src='${jsPathSrc}' defer></script>
        </head>
        <body>
            <div id="mathBlock"><img src="" id="math" /></div>
        </body>
        </html>`
    }

    private async update(ev?: UpdateEvent) {
        if (!this.panel || !this.panel.visible) {
            return
        }
        const editor = vscode.window.activeTextEditor
        const document = editor?.document
        if (!editor || !document?.languageId || !hasTexId(document.languageId)) {
            this.clearCache()
            return
        }
        const documentUri = document.uri.toString()
        const cursorPos = ev?.event.selections[0]?.active ?? editor.selection.active
        const texMath = this.getTexMath(document, cursorPos)
        if (!texMath) {
            this.clearCache()
            return
        }
        let cachedCommands: string | undefined
        if (cursorPos.line === this.prevCursorPosition?.line && documentUri === this.prevDocumentUri) {
            cachedCommands = this.prevNewCommands
        }
        const newTeXMath = this.needCursor ? await this.renderCursor(document, texMath) : texMath
        const result = await this.mathPreview.generateSVG(newTeXMath, cachedCommands).catch(() => undefined)
        if (!result) {
            return
        }
        this.prevDocumentUri = documentUri
        this.prevNewCommands = result.newCommands
        this.prevCursorPosition = cursorPos
        return this.panel.webview.postMessage({type: 'mathImage', src: result.svgDataUrl })
    }

    private getTexMath(document: vscode.TextDocument, position: vscode.Position) {
        const texMath = this.mathPreview.findMathEnvIncludingPosition(document, position)
        if (texMath) {
            if (texMath.envname !== '$') {
                return texMath
            }
            if (texMath.range.start.character !== position.character && texMath.range.end.character !== position.character) {
                return texMath
            }
        }
        return
    }

    private async renderCursor(document: vscode.TextDocument, tex: TexMathEnv, cursorPos?: vscode.Position) {
        const texString = await this.mathPreview.renderCursor(document, tex, cursorPos) ?? tex.texString
        return { texString, envname: tex.envname }
    }

}
