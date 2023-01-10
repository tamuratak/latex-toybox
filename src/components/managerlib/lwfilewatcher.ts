import * as vscode from 'vscode'
import * as path from 'path'


export class LwFileWatcher {
    private readonly otherFileWatcher = new Map<string, vscode.FileSystemWatcher>()
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
        this.otherFileWatcher.forEach(watcher => void watcher.dispose())
    }

    add(fileUri: vscode.Uri) {
        if (vscode.workspace.getWorkspaceFolder(fileUri)) {
            return
        }
        const dirname = path.posix.dirname(fileUri.path)
        const dirUri = fileUri.with({ path: dirname })
        const key = dirUri.toString(true)
        const isWatched = this.otherFileWatcher.has(key)
        if (!isWatched) {
            const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(dirUri, '*'))
            this.otherFileWatcher.set(key, watcher)
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
