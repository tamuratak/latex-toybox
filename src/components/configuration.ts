import * as vscode from 'vscode'
import { Logger } from './logger'


export class Configuration {

    constructor(private readonly extension: {
        readonly extensionContext: vscode.ExtensionContext,
        readonly logger: Logger
    }) {
        this.logConfiguration()
        extension.extensionContext.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration((ev) => {
                this.logChangeOnConfiguration(ev)
            })
        )
    }

    private readonly configurationsToLog = [
        'editor.acceptSuggestionOnEnter',
        'latex-toybox.bind.enter.key',
        'latex-toybox.hover.preview.mathjax.extensions',
        'latex-toybox.intellisense.package.enabled',
        'latex-toybox.latex.autoBuild.run',
        'latex-toybox.latex.outDir',
        'latex-toybox.latex.recipes',
        'latex-toybox.latex.tools',
        'latex-toybox.view.pdf.keyboardEvent'
    ]

    private logConfiguration() {
        const workspaceFolders = vscode.workspace.workspaceFolders || [undefined]
        for (const workspace of workspaceFolders) {
            this.extension.logger.info(`Configuration for workspace: ${workspace?.uri.toString(true)}`)
            const configuration = vscode.workspace.getConfiguration(undefined, workspace)
            for(const config of this.configurationsToLog) {
                const value = configuration.get(config)
                this.extension.logger.info(`${config}: ${JSON.stringify(value, null, ' ')}`)
            }
        }
    }

    private logChangeOnConfiguration(ev: vscode.ConfigurationChangeEvent) {
        const workspaceFolders = vscode.workspace.workspaceFolders || [undefined]
        for(const config of this.configurationsToLog) {
            for (const workspace of workspaceFolders) {
                if (ev.affectsConfiguration(config, workspace)) {
                    const configuration = vscode.workspace.getConfiguration(undefined, workspace)
                    const value = configuration.get(config)
                    this.extension.logger.info(`Configuration changed to { ${config}: ${JSON.stringify(value)} } at ${workspace?.uri.toString(true)}`)
                }
            }
        }
    }

}
