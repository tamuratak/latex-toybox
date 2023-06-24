import * as vscode from 'vscode'

import { toKey } from '../../utils/tokey'
import type { LwFileWatcher } from './lwfilewatcher'
import type { Completer } from '../../providers/completion'
import type { Logger } from '../logger'
import type { Manager } from '../manager'

export class BibWatcher {
    private readonly watchedBibs = new Set<string>()

    constructor(
        private readonly extension: {
            readonly completer: Completer,
            readonly logger: Logger,
            readonly manager: Manager
        },
        private readonly lwFileWatcher: LwFileWatcher) {
        this.initiateBibwatcher(lwFileWatcher)
    }

    initiateBibwatcher(watcher: LwFileWatcher) {
        watcher.onDidChange((uri) => this.onWatchedBibChanged(uri))
        watcher.onDidDelete((uri) => this.onWatchedBibDeleted(uri))
    }

    private async onWatchedBibChanged(bibFileUri: vscode.Uri) {
        const key = toKey(bibFileUri)
        if (!this.watchedBibs.has(key)) {
            return
        }
        this.extension.logger.info(`Bib file watcher - file changed: ${bibFileUri}`)
        await this.extension.completer.citation.parseBibFile(bibFileUri.fsPath)
        await this.extension.manager.buildOnFileChanged(bibFileUri.fsPath, true)
    }

    private onWatchedBibDeleted(bibFileUri: vscode.Uri) {
        const key = toKey(bibFileUri)
        if (!this.watchedBibs.has(key)) {
            return
        }
        this.extension.logger.info(`Bib file watcher - file deleted: ${bibFileUri}`)
        this.watchedBibs.delete(key)
        this.extension.completer.citation.removeEntriesInFile(bibFileUri.fsPath)
    }

    async watchAndParseBibFile(bibFilePath: string) {
        const uri = vscode.Uri.file(bibFilePath)
        const key = toKey(uri)
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
