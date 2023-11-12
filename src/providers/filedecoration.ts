import * as vscode from 'vscode'
import type { Manager } from '../components/manager.js'
import type { EventBus } from '../components/eventbus.js'


export class FileDecorationProvider implements vscode.FileDecorationProvider {
    private readonly eventEmitter = new vscode.EventEmitter<vscode.Uri | undefined>()
    readonly onDidChangeFileDecorations?: vscode.Event<vscode.Uri | undefined>

    constructor(private readonly extension: {
        readonly extensionContext: vscode.ExtensionContext,
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
        extension.extensionContext.subscriptions.push(
            this.eventEmitter
        )
    }

    public provideFileDecoration(uri: vscode.Uri) {
        const configuration = vscode.workspace.getConfiguration('latex-toybox')
        const decoration: string = configuration.get('decoration.rootFile', '')
        const rootFile = this.extension.manager.rootFile
        if (uri.fsPath === rootFile && decoration !== '') {
            return {
                badge: decoration,
                tooltip: 'Current LaTeX Root File',
            }
        }
        const subFileRoot = this.extension.manager.localRootFile
        const subdecoration: string = configuration.get('decoration.rootSubFile', '')
        if (uri.fsPath === subFileRoot && subdecoration !== '') {
            return {
                badge: subdecoration,
                tooltip: 'Current LaTeX Root SubFile',
            }
        }
        return
    }

}
