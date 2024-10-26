import type * as vscode from 'vscode'

import type { Commander } from '../../commander.js'

export class PdfViewerHookProvider implements vscode.CustomReadonlyEditorProvider {

    constructor(private readonly extension: {
        readonly commander: Commander
    }) {
        this.extension = extension
    }

    openCustomDocument(uri: vscode.Uri) {
        return {
            uri,
            dispose: () => undefined
        }
    }

    resolveCustomEditor(document: vscode.CustomDocument, webviewPanel: vscode.WebviewPanel) {
        webviewPanel.webview.html = 'LaTeX Toybox PDF Viewer is opening a PDF file...'
        setTimeout(() => {
            webviewPanel.dispose()
            void this.extension.commander.pdf(document.uri)
        }, 1000)
    }

}
