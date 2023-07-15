import * as vscode from 'vscode'

import { MutexWithSizedQueue } from '../utils/mutexwithsizedqueue'
import { ChkTeX } from './linterlib/chktex'
import { LaCheck } from './linterlib/lacheck'
import { isLocalLatexDocument } from '../lib/lwfs/lwfs'
import type { EventBus } from './eventbus'
import type { Logger } from './logger'
import type { Manager } from './manager'

export interface ILinter {
    readonly linterDiagnostics: vscode.DiagnosticCollection,
    lintRootFile(): Promise<void>
}

export class Linter {
    private readonly lintMutex = new MutexWithSizedQueue(1)
    readonly lacheck: ILinter
    readonly chktex: ILinter

    constructor(private readonly extension: {
        readonly extensionContext: vscode.ExtensionContext,
        readonly eventBus: EventBus,
        readonly logger: Logger,
        readonly manager: Manager
    }) {
        this.chktex = new ChkTeX(this.extension)
        this.lacheck = new LaCheck(this.extension)

        extension.eventBus.rootFileChanged.event(() => {
            void this.lintRootFileIfEnabled()
        })

        extension.extensionContext.subscriptions.push(
            vscode.workspace.onDidSaveTextDocument((e) => {
                if (!isLocalLatexDocument(e)){
                    return
                }
                void this.lintRootFileIfEnabled()
            })
        )
    }

    private getLinters(scope?: vscode.ConfigurationScope): ILinter[] {
        scope ||= this.extension.manager.getWorkspaceFolderRootDir()
        const configuration = vscode.workspace.getConfiguration('latex-toybox', scope)
        const linters: ILinter[] = []
        if (configuration.get('linting.chktex.enabled')) {
            linters.push(this.chktex)
        }
        if (configuration.get('linting.lacheck.enabled')) {
            linters.push(this.lacheck)
        }
        return linters
    }

    private clear(scope?: vscode.ConfigurationScope) {
        scope ||= this.extension.manager.getWorkspaceFolderRootDir()
        const configuration = vscode.workspace.getConfiguration('latex-toybox', scope)
        if (!configuration.get('linting.chktex.enabled')) {
            this.chktex.linterDiagnostics.clear()
        }
        if (!configuration.get('linting.lacheck.enabled')) {
            this.lacheck.linterDiagnostics.clear()
        }
    }

    async lintRootFileIfEnabled() {
        await this.lintMutex.noopIfOccupied(async () => {
            const linters = this.getLinters()
            this.clear()
            await Promise.allSettled(
                linters.map(linter => linter.lintRootFile())
            )
        })
    }

}
