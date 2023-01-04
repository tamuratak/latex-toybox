import * as vscode from 'vscode'

import type {Extension} from '../../main'
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

    private toKey(pdfFileUri: vscode.Uri) {
        return pdfFileUri.toString(true)
    }

    private initiatePdfWatcher(pdfWatcher: LwFileWatcher) {
        pdfWatcher.onDidChange((uri) => this.onPdfChanged(uri))
        pdfWatcher.onDidDelete((uri) => this.onPdfDeleted(uri))
    }

    private onPdfChanged(fileUri: vscode.Uri) {
        const pdfKey = this.toKey(fileUri)
        if (!this.watchedPdfs.has(pdfKey)) {
            return
        }
        if (this.isIgnored(fileUri)) {
            return
        }
        this.extension.logger.info(`PDF file watcher - file changed: ${fileUri}`)
        this.extension.viewer.refreshExistingViewer(undefined, fileUri)
    }

    private onPdfDeleted(fileUri: vscode.Uri) {
        const pdfKey = this.toKey(fileUri)
        this.watchedPdfs.delete(pdfKey)
        this.extension.logger.info(`PDF file watcher - file deleted: ${fileUri}`)
    }

    watchPdfFile(pdfFileUri: vscode.Uri) {
        this.extension.logger.info(`Added to PDF file watcher: ${pdfFileUri}`)
        const pdfKey = this.toKey(pdfFileUri)
        this.lwFileWatcher.add(pdfFileUri)
        this.watchedPdfs.add(pdfKey)
    }

    private isIgnored(pdfFileUri: vscode.Uri): boolean {
        const key = this.toKey(pdfFileUri)
        return this.ignoredPdfUris.has(key)
    }

    ignorePdfFile(pdfFileUri: vscode.Uri) {
        this.ignoredPdfUris.add(this.toKey(pdfFileUri))
    }

    logWatchedFiles() {
        this.extension.logger.debug(`PdfWatcher.pdfsWatched: ${JSON.stringify(Array.from(this.watchedPdfs))}`)
        this.extension.logger.debug(`PdfWatcher.ignoredPdfUris: ${JSON.stringify(Array.from(this.ignoredPdfUris))}`)
    }

}
