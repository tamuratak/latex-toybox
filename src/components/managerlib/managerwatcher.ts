import * as vscode from 'vscode'
import { toKey } from '../../utils/tokey'
import type { LwFileWatcher } from './lwfilewatcher'
import type { Logger } from '../logger'
import { inspectReadable } from '../../utils/inspect'


export class ManagerWatcher {
    // key: filePath
    private readonly watchedFiles = new Set<string>()
    private readonly lwFileWatcher: LwFileWatcher

    constructor(
        private readonly extension: {
            readonly logger: Logger
        },
        watcher: LwFileWatcher
    ) {
        this.lwFileWatcher = watcher
    }

    getWatchedFiles() {
        return new Set(this.watchedFiles)
    }

    isWatched(fileUri: vscode.Uri) {
        const key = toKey(fileUri)
        return this.watchedFiles.has(key)
    }

    add(fileUri: vscode.Uri) {
        const key = toKey(fileUri)
        this.watchedFiles.add(key)
        this.lwFileWatcher.add(fileUri)
    }

    private delete(fileUri: vscode.Uri) {
        const key = toKey(fileUri)
        this.watchedFiles.delete(key)
    }

    clear() {
        this.watchedFiles.clear()
    }

    onDidCreate(cb: (uri: vscode.Uri) => unknown): vscode.Disposable {
        return this.lwFileWatcher.onDidCreate(cb)
    }

    onDidChange(cb: (uri: vscode.Uri) => unknown): vscode.Disposable {
        return this.lwFileWatcher.onDidChange((fileUri) => {
            if (!this.isWatched(fileUri)) {
                return
            }
            this.extension.logger.info(`ManagerWatcher - file changed: ${fileUri}`)
            return cb(fileUri)
        })
    }

    onDidDelete(cb: (uri: vscode.Uri) => unknown): vscode.Disposable {
        return this.lwFileWatcher.onDidDelete((fileUri) => {
            if (!this.isWatched(fileUri)) {
                return
            }
            this.delete(fileUri)
            this.extension.logger.info(`ManagerWatcher - file deleted: ${fileUri}`)
            return cb(fileUri)
        })
    }

    logWatchedFiles() {
        this.extension.logger.debug(`ManagerWatcher.watchedFiles: ${inspectReadable(this.watchedFiles)}`)
    }

}
