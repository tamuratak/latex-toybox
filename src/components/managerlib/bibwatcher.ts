import * as vscode from 'vscode'

import { toKey } from '../../utils/tokey.js'
import type { LwFileWatcher } from './lwfilewatcher.js'
import type { Completer } from '../../providers/completion.js'
import type { Logger } from '../logger.js'
import { inspectReadable } from '../../utils/inspect.js'


export class BibWatcher {
    private readonly watchedBibs = new Set<string>()
    private readonly onDidChangeCbs = new Set<(uri: vscode.Uri) => unknown>()

    constructor(
        private readonly extension: {
            readonly completer: Completer,
            readonly logger: Logger
        },
        private readonly lwFileWatcher: LwFileWatcher
    ) {
        this.initiateBibwatcher(lwFileWatcher)
        this.onDidChange((uri) => this.extension.completer.citation.parseBibFile(uri.fsPath))
    }

    clear() {
        this.watchedBibs.clear()
    }

    private initiateBibwatcher(watcher: LwFileWatcher) {
        watcher.onDidChange((uri) => this.onWatchedBibChanged(uri))
        watcher.onDidDelete((uri) => this.onWatchedBibDeleted(uri))
    }

    private onWatchedBibChanged(bibFileUri: vscode.Uri) {
        const key = toKey(bibFileUri)
        if (!this.watchedBibs.has(key)) {
            return
        }
        this.extension.logger.info(`Bib file watcher - file changed: ${bibFileUri}`)
        this.onDidChangeCbs.forEach(cb => cb(bibFileUri))
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

    onDidChange(cb: (uri: vscode.Uri) => unknown): vscode.Disposable {
        this.onDidChangeCbs.add(cb)
        return new vscode.Disposable(() => this.onDidChangeCbs.delete(cb))
    }

    logWatchedFiles() {
        this.extension.logger.debug(`BibWatcher.bibsWatched: ${inspectReadable(this.watchedBibs)}`)
    }

}
