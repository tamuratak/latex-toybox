import * as vscode from 'vscode'
import type { Manager } from '../components/manager'
import type { EventBus } from '../components/eventbus'
import { toKey } from '../utils/tokey'


export class FileDecorationProvider implements vscode.FileDecorationProvider {
    private readonly eventEmitter = new vscode.EventEmitter<vscode.Uri | undefined>()
    readonly onDidChangeFileDecorations?: vscode.Event<vscode.Uri | undefined>

    constructor(private readonly extension: {
        readonly eventBus: EventBus,
        readonly manager: Manager
    }) {
        this.onDidChangeFileDecorations = this.eventEmitter.event
        setTimeout(() => {
            const rootFileUri = this.extension.manager.rootFileUri
            if (rootFileUri) {
                this.eventEmitter.fire(rootFileUri)
            }
        }, 5000)
        this.extension.eventBus.rootFileChanged.event((filePath) => {
            this.eventEmitter.fire(vscode.Uri.file(filePath))
        })
    }

    public provideFileDecoration(uri: vscode.Uri) {
        const configuration = vscode.workspace.getConfiguration('latex-workshop')
        const decoration = configuration.get('decoration.rootFile', '')
        if (decoration === '') {
            return
        }
        const rootFileUri = this.extension.manager.rootFileUri
        if (!rootFileUri) {
            return
        }
        const rootFileKey = toKey(rootFileUri)
        const uirKey = toKey(uri)
        if (rootFileKey === uirKey) {
            return {
                badge: decoration,
                tooltip: 'Current LaTeX Root File',
            }
        }
        const subFileRoot = this.extension.manager.localRootFile
        if (!subFileRoot) {
            return
        }
        const subdecoration = configuration.get('decoration.rootSubFile', '')
        if (uri.fsPath === subFileRoot) {
            return {
                badge: subdecoration,
                tooltip: 'Current LaTeX Root SubFile',
            }
        }
        return
    }

}
