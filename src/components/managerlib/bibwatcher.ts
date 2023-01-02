import * as vscode from 'vscode'

import type {Extension} from '../../main'
import { LwFileWatcher } from './lwfilewatcher'

export class BibWatcher {
    private readonly extension: Extension
    private readonly watchedBibs = new Set<string>()
    private readonly lwFileWatcher: LwFileWatcher

    constructor(extension: Extension, watcher: LwFileWatcher) {
        this.extension = extension
        this.lwFileWatcher = watcher
        this.initiateBibwatcher(watcher)
    }

    private toKey(pdfFileUri: vscode.Uri) {
        return pdfFileUri.toString(true)
    }

    initiateBibwatcher(watcher: LwFileWatcher) {
        this.extension.logger.info('Creating Bib file watcher.')
        watcher.onDidChange((uri) => this.onWatchedBibChanged(uri))
        watcher.onDidDelete((uri) => this.onWatchedBibDeleted(uri))
    }

    private async onWatchedBibChanged(fileUri: vscode.Uri) {
        const key = this.toKey(fileUri)
        if (!this.watchedBibs.has(key)) {
            return
        }
        this.extension.logger.info(`Bib file watcher - file changed: ${fileUri}`)
        await this.extension.completer.citation.parseBibFile(fileUri.fsPath)
        await this.extension.manager.buildOnFileChanged(fileUri.fsPath, true)
    }

    private onWatchedBibDeleted(fileUri: vscode.Uri) {
        const key = this.toKey(fileUri)
        if (!this.watchedBibs.has(key)) {
            return
        }
        this.extension.logger.info(`Bib file watcher - file deleted: ${fileUri}`)
        this.watchedBibs.delete(key)
        this.extension.completer.citation.removeEntriesInFile(fileUri.fsPath)
    }

    async watchAndParseBibFile(bibPath: string) {
        const uri = vscode.Uri.file(bibPath)
        const key = this.toKey(uri)
        if (!this.watchedBibs.has(key)) {
            this.extension.logger.info(`Added to bib file watcher: ${bibPath}`)
            this.lwFileWatcher.add(uri)
            this.watchedBibs.add(key)
            await this.extension.completer.citation.parseBibFile(bibPath)
        }
    }

    logWatchedFiles() {
        this.extension.logger.debug(`BibWatcher.bibsWatched: ${JSON.stringify(Array.from(this.watchedBibs))}`)
    }

}
