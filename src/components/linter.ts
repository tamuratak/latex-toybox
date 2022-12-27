import * as vscode from 'vscode'

import type {EventBusLocator, ExtensionContextLocator, ExtensionRootLocator, LoggerLocator, ManagerLocator} from '../interfaces'
import { MutexWithSizedQueue } from '../utils/mutexwithsizedqueue'
import { ChkTeX } from './linterlib/chktex'
import { LaCheck } from './linterlib/lacheck'

export interface ILinter {
    readonly linterDiagnostics: vscode.DiagnosticCollection,
    lintRootFile(): Promise<void>,
    lintFile(document: vscode.TextDocument): Promise<void>
}

interface IExtension extends
    ExtensionContextLocator,
    ExtensionRootLocator,
    EventBusLocator,
    LoggerLocator,
    ManagerLocator { }

export class Linter {
    private readonly lintMutex = new MutexWithSizedQueue(1)
    readonly lacheck: ILinter
    readonly chktex: ILinter
    private prevTime: number = 0

    constructor(private readonly extension: IExtension) {
        this.chktex = new ChkTeX(this.extension)
        this.lacheck = new LaCheck(this.extension)

        extension.eventBus.onDidChangeRootFile(() => {
            void this.lintRootFileIfEnabled()
        })

        extension.extensionContext.subscriptions.push(
            vscode.workspace.onDidSaveTextDocument((e) => {
                if (!extension.manager.isLocalTexFile(e)){
                    return
                }
                void this.lintRootFileIfEnabled()
            }),
            vscode.workspace.onDidChangeTextDocument((e) => {
                if (!extension.manager.isLocalTexFile(e.document)) {
                    return
                }
                void this.lintActiveFileIfEnabledAfterInterval(e.document)
            })
        )
    }

    private getLinters(scope?: vscode.ConfigurationScope): ILinter[] {
        scope ||= this.extension.manager.getWorkspaceFolderRootDir()
        const configuration = vscode.workspace.getConfiguration('latex-workshop', scope)
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
        const configuration = vscode.workspace.getConfiguration('latex-workshop', scope)
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

    async lintActiveFileIfEnabledAfterInterval(document: vscode.TextDocument) {
        await this.lintMutex.noopIfOccupied(async () => {
            const configuration = vscode.workspace.getConfiguration('latex-workshop', document)
            const linters = this.getLinters(document)
            this.clear(document)
            if (linters.length > 0 && (configuration.get('linting.run') as string) === 'onType') {
                const interval = configuration.get('linting.delay') as number
                const now = Date.now()
                if (now - this.prevTime < interval) {
                    return
                }
                this.prevTime = now
                await Promise.allSettled(
                    linters.map(linter => linter.lintFile(document))
                )
            }
        })
    }

}
