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

    private toKey(bibFileUri: vscode.Uri) {
        return bibFileUri.toString(true)
    }

    initiateBibwatcher(watcher: LwFileWatcher) {
        this.extension.logger.info('Creating Bib file watcher.')
        watcher.onDidChange((uri) => this.onWatchedBibChanged(uri))
        watcher.onDidDelete((uri) => this.onWatchedBibDeleted(uri))
    }

    private async onWatchedBibChanged(bibFileUri: vscode.Uri) {
        const key = this.toKey(bibFileUri)
        if (!this.watchedBibs.has(key)) {
            return
        }
        this.extension.logger.info(`Bib file watcher - file changed: ${bibFileUri}`)
        await this.extension.completer.citation.parseBibFile(bibFileUri.fsPath)
        await this.extension.manager.buildOnFileChanged(bibFileUri.fsPath, true)
    }

    private onWatchedBibDeleted(bibFileUri: vscode.Uri) {
        const key = this.toKey(bibFileUri)
        if (!this.watchedBibs.has(key)) {
            return
        }
        this.extension.logger.info(`Bib file watcher - file deleted: ${bibFileUri}`)
        this.watchedBibs.delete(key)
        this.extension.completer.citation.removeEntriesInFile(bibFileUri.fsPath)
    }

    async watchAndParseBibFile(bibFilePath: string) {
        const uri = vscode.Uri.file(bibFilePath)
        const key = this.toKey(uri)
        if (!this.watchedBibs.has(key)) {
            this.extension.logger.info(`Added to bib file watcher: ${bibFilePath}`)
            this.lwFileWatcher.add(uri)
            this.watchedBibs.add(key)
            await this.extension.completer.citation.parseBibFile(bibFilePath)
        }
    }

    logWatchedFiles() {
        this.extension.logger.debug(`BibWatcher.bibsWatched: ${JSON.stringify(Array.from(this.watchedBibs))}`)
    }

}
