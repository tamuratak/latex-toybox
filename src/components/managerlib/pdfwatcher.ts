import * as vscode from 'vscode'
import { toKey } from '../../utils/tokey.js'
import type { LwFileWatcher } from './lwfilewatcher.js'
import type { Logger } from '../logger.js'
import type { Viewer } from '../viewer.js'
import { sleep } from '../../utils/utils.js'
import { inspectReadable } from '../../utils/inspect.js'


export class PdfWatcher {
    private readonly watchedPdfs = new Set<string>()
    private readonly ignoredPdfUris = new Set<string>()
    private readonly lwFileWatcher: LwFileWatcher

    constructor(
        private readonly extension: {
            readonly logger: Logger,
            readonly viewer: Viewer | undefined
        },
        watcher: LwFileWatcher
    ) {
        this.lwFileWatcher = watcher
        this.initiatePdfWatcher(watcher)
    }

    private initiatePdfWatcher(pdfWatcher: LwFileWatcher) {
        pdfWatcher.onDidChange((uri) => this.onPdfChanged(uri))
        pdfWatcher.onDidDelete((uri) => this.onPdfDeleted(uri))
    }

    private async onPdfChanged(pdfFileUri: vscode.Uri) {
        const pdfKey = toKey(pdfFileUri)
        if (!this.watchedPdfs.has(pdfKey)) {
            return
        }
        if (this.isIgnored(pdfFileUri)) {
            return
        }
        const configuration = vscode.workspace.getConfiguration('latex-toybox', pdfFileUri)
        const delay = configuration.get('view.pdf.reload.delay', 250)
        await sleep(delay)
        this.extension.logger.info(`PDF file watcher - file changed: ${pdfFileUri}`)
        this.extension.viewer?.refreshExistingViewer(undefined, pdfFileUri)
    }

    private onPdfDeleted(pdfFileUri: vscode.Uri) {
        const pdfKey = toKey(pdfFileUri)
        this.watchedPdfs.delete(pdfKey)
        this.extension.logger.info(`PDF file watcher - file deleted: ${pdfFileUri}`)
    }

    watchPdfFile(pdfFileUri: vscode.Uri) {
        this.extension.logger.info(`Added to PDF file watcher: ${pdfFileUri}`)
        const pdfKey = toKey(pdfFileUri)
        this.lwFileWatcher.add(pdfFileUri)
        this.watchedPdfs.add(pdfKey)
    }

    private isIgnored(pdfFileUri: vscode.Uri): boolean {
        const key = toKey(pdfFileUri)
        return this.ignoredPdfUris.has(key)
    }

    ignorePdfFile(pdfFileUri: vscode.Uri) {
        this.ignoredPdfUris.add(toKey(pdfFileUri))
    }

    logWatchedFiles() {
        this.extension.logger.debug(`PdfWatcher.pdfsWatched: ${inspectReadable(this.watchedPdfs)}`)
        this.extension.logger.debug(`PdfWatcher.ignoredPdfUris: ${inspectReadable(this.ignoredPdfUris)}`)
    }

}
