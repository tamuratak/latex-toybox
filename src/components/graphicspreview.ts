import * as vscode from 'vscode'
import * as path from 'node:path'
import { existsPath } from '../lib/lwfs/lwfs.js'
import type { Completer } from '../providers/completion.js'
import type { Logger } from './logger.js'
import type { Manager } from './manager.js'
import type { SnippetView } from './snippetview.js'


export class GraphicsPreview {

    constructor(private readonly extension: {
        readonly completer: Completer,
        readonly logger: Logger,
        readonly manager: Manager,
        readonly snippetView: SnippetView
    }) { }

    async provideHover(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Hover | undefined> {
        const pat = /\\includegraphics\s*(?:\[(.*?)\])?\s*\{(.*?)\}/
        const range = document.getWordRangeAtPosition(position, pat)
        if (!range) {
            return undefined
        }
        const cmdString = document.getText(range)
        const execArray = pat.exec(cmdString)
        const relPath = execArray && execArray[2]
        const includeGraphicsArgs = execArray && execArray[1]
        if (!execArray || !relPath) {
            return undefined
        }
        const filePath = await this.findFilePath(relPath, document)
        if (filePath === undefined) {
            return undefined
        }
        let pageNumber = 1
        if (includeGraphicsArgs) {
            const m = /page\s*=\s*(\d+)/.exec(includeGraphicsArgs)
            if (m && m[1]) {
                pageNumber = Number(m[1])
            }
        }
        const md = await this.renderGraphicsAsMarkdownString(filePath, { height: 230, width: 500, pageNumber })
        if (md !== undefined) {
            return new vscode.Hover(md, range)
        }
        return undefined
    }

    async renderGraphicsAsMarkdownString(filePath: string, opts: { height: number, width: number, pageNumber?: number }): Promise<vscode.MarkdownString | undefined> {
        const filePathUriString = vscode.Uri.file(filePath).toString()
        if (/\.(bmp|jpg|jpeg|gif|png)$/i.exec(filePath)) {
            // Workaround for https://github.com/microsoft/vscode/issues/137632
            if (vscode.env.remoteName) {
                const md = new vscode.MarkdownString(`![img](${filePathUriString})`)
                return md
            }
            const md = new vscode.MarkdownString(`<img src="${filePathUriString}" height="${opts.height}">`)
            md.supportHtml = true
            return md
        }
        if (/\.pdf$/i.exec(filePath)) {
            const pdfOpts = { height: opts.height, width: opts.width, pageNumber: opts.pageNumber || 1 }
            const dataUrl = await this.renderPdfFileAsDataUrl(filePath, pdfOpts)
            if (dataUrl !== undefined) {
                const md = new vscode.MarkdownString(`<img src="${dataUrl}" height="${opts.height}">`)
                md.supportHtml = true
                return md
            } else {
                let msg = '$(error) Failed to render.'
                if (!vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath))) {
                    msg = '$(warning) Cannot render a PDF file not in workspaces.'
                } else if (!this.extension.snippetView.snippetViewProvider.webviewView) {
                    msg = '$(info) Please activate Snippet View to render the thumbnail of a PDF file.'
                }
                return new vscode.MarkdownString(msg, true)
            }
        }
        return
    }

    private async renderPdfFileAsDataUrl(pdfFilePath: string, opts: { height: number, width: number, pageNumber: number }): Promise<string | undefined> {
        try {
            const maxDataUrlLength = 99980
            let scale = 1.5
            let newOpts = { height: opts.height * scale , width: opts.width * scale, pageNumber: opts.pageNumber }
            let dataUrl = await this.extension.snippetView.renderPdf(vscode.Uri.file(pdfFilePath), newOpts)
            if (!dataUrl || dataUrl.length < maxDataUrlLength) {
                return dataUrl
            }
            scale = 1
            newOpts = { height: opts.height * scale , width: opts.width * scale, pageNumber: opts.pageNumber }
            dataUrl = await this.extension.snippetView.renderPdf(vscode.Uri.file(pdfFilePath), newOpts)
            if (!dataUrl || dataUrl.length < maxDataUrlLength) {
                return dataUrl
            }
            scale = Math.sqrt(maxDataUrlLength/dataUrl.length) / 1.2
            newOpts = { height: opts.height * scale , width: opts.width * scale, pageNumber: opts.pageNumber }
            dataUrl = await this.extension.snippetView.renderPdf(vscode.Uri.file(pdfFilePath), newOpts)
            if (dataUrl && dataUrl.length >= maxDataUrlLength) {
                this.extension.logger.error(`Data URL still too large: ${pdfFilePath}`)
                return undefined
            }
            return dataUrl
        } catch (e) {
            this.extension.logger.error(`Failed to renderGraphicsAsDataUrl: ${pdfFilePath}`)
            this.extension.logger.logError(e)
            return undefined
        }
    }

    private async findFilePath(relPath: string, document: vscode.TextDocument) {
        if (path.isAbsolute(relPath)) {
            if (await existsPath(relPath)) {
                return relPath
            } else {
                return undefined
            }
        }

        const activeDir = path.dirname(document.uri.fsPath)
        for (const dirPath of this.extension.completer.input.graphicsPath) {
            const filePath = path.resolve(activeDir, dirPath, relPath)
            if (await existsPath(filePath)) {
                return filePath
            }
        }

        const fPath = path.resolve(activeDir, relPath)
        if (await existsPath(fPath)) {
            return fPath
        }

        const rootDir = this.extension.manager.rootDir
        if (rootDir === undefined) {
            return undefined
        }
        const frPath = path.resolve(rootDir, relPath)
        if (await existsPath(frPath)) {
            return frPath
        }
        return undefined
    }

}
