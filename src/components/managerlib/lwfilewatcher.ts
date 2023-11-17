import * as vscode from 'vscode'
import * as path from 'node:path'
import { toKey } from '../../utils/tokey.js'


export class LwFileWatcher {
    // key: dirPath
    private readonly externalFileWatcherMap = new Map<string, vscode.FileSystemWatcher>()
    private readonly workspaceFileWatcher = vscode.workspace.createFileSystemWatcher('**/*')
    private readonly onDidCreateCbs = new Set<(uri: vscode.Uri) => unknown>()
    private readonly onDidChangeCbs = new Set<(uri: vscode.Uri) => unknown>()
    private readonly onDidDeleteCbs = new Set<(uri: vscode.Uri) => unknown>()

    constructor() {
        this.initiateWatcher(this.workspaceFileWatcher)
    }

    private initiateWatcher(watcher: vscode.FileSystemWatcher) {
        watcher.onDidCreate(uri => this.onDidCreateCbs.forEach(cb => cb(uri)))
        watcher.onDidChange(uri => this.onDidChangeCbs.forEach(cb => cb(uri)))
        watcher.onDidDelete(uri => this.onDidDeleteCbs.forEach(cb => cb(uri)))
    }

    dispose() {
        this.workspaceFileWatcher.dispose()
        this.externalFileWatcherMap.forEach(watcher => void watcher.dispose())
    }

    /**
     * Creates a external file watcher for the directory of the given file
     * if the file is not included in any of the workspaces.
     * This allows you to watch for changes in files outside of the current workspace.
     */
    add(fileUri: vscode.Uri) {
        // Files that are already included in any of the workspaces are already
        // being watched by the workspaceFileWatcher. So, we don't need to
        // create a new watcher for them.
        if (vscode.workspace.getWorkspaceFolder(fileUri)) {
            return
        }
        const dirname = path.posix.dirname(fileUri.path)
        const dirUri = fileUri.with({ path: dirname })
        const key = toKey(dirUri)
        const isWatched = this.externalFileWatcherMap.has(key)
        if (!isWatched) {
            const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(dirUri, '*'))
            this.externalFileWatcherMap.set(key, watcher)
            this.initiateWatcher(watcher)
        }
    }

    onDidCreate(cb: (uri: vscode.Uri) => unknown): vscode.Disposable {
        this.onDidCreateCbs.add(cb)
        return new vscode.Disposable(() => this.onDidCreateCbs.delete(cb))
    }

    onDidChange(cb: (uri: vscode.Uri) => unknown): vscode.Disposable {
        this.onDidChangeCbs.add(cb)
        return new vscode.Disposable(() => this.onDidChangeCbs.delete(cb))
    }

    onDidDelete(cb: (uri: vscode.Uri) => unknown): vscode.Disposable {
        this.onDidDeleteCbs.add(cb)
        return new vscode.Disposable(() => this.onDidDeleteCbs.delete(cb))
    }

}
