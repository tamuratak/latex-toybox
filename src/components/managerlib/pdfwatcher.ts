import * as vscode from 'vscode'

import type {Extension} from '../../main'
import { toKey } from '../../utils/tokey'
import { LwFileWatcher } from './lwfilewatcher'

export class PdfWatcher {
    private readonly extension: Extension
    private readonly watchedPdfs = new Set<string>()
    private readonly ignoredPdfUris = new Set<string>()
    private readonly lwFileWatcher: LwFileWatcher

    constructor(extension: Extension, watcher: LwFileWatcher) {
        this.extension = extension
        this.lwFileWatcher = watcher
        this.initiatePdfWatcher(watcher)
    }

    private initiatePdfWatcher(pdfWatcher: LwFileWatcher) {
        pdfWatcher.onDidChange((uri) => this.onPdfChanged(uri))
        pdfWatcher.onDidDelete((uri) => this.onPdfDeleted(uri))
    }

    private onPdfChanged(pdfFileUri: vscode.Uri) {
        const pdfKey = toKey(pdfFileUri)
        if (!this.watchedPdfs.has(pdfKey)) {
            return
        }
        if (this.isIgnored(pdfFileUri)) {
            return
        }
        this.extension.logger.info(`PDF file watcher - file changed: ${pdfFileUri}`)
        this.extension.viewer.refreshExistingViewer(undefined, pdfFileUri)
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
        this.extension.logger.debug(`PdfWatcher.pdfsWatched: ${JSON.stringify(Array.from(this.watchedPdfs))}`)
        this.extension.logger.debug(`PdfWatcher.ignoredPdfUris: ${JSON.stringify(Array.from(this.ignoredPdfUris))}`)
    }

}
