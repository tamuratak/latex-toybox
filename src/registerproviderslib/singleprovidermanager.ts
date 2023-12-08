import * as vscode from 'vscode'


export abstract class SingleProviderManager implements vscode.Disposable {
    private disposable: vscode.Disposable | undefined
    private configDisposable: vscode.Disposable | undefined

    constructor() {
        if (this.isEnabled()) {
            this.disposable = this.register()
        }

        this.configDisposable = vscode.workspace.onDidChangeConfiguration((e) => {
            if (this.isAffected(e)) {
                if (this.isEnabled()) {
                    this.disposable?.dispose()
                    this.disposable = this.register()
                } else {
                    this.disposable?.dispose()
                    this.disposable = undefined
                }
            }
        })
    }

    dispose() {
        this.configDisposable?.dispose()
        this.configDisposable = undefined
        this.disposable?.dispose()
        this.disposable = undefined
    }

    protected abstract isEnabled(): boolean

    protected abstract isAffected(e: vscode.ConfigurationChangeEvent): boolean

    protected abstract register(): vscode.Disposable

}
