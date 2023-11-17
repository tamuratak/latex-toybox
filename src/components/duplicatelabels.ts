import * as vscode from 'vscode'
import * as path from 'node:path'

import type { EventBus } from './eventbus.js'
import type { CompletionUpdater } from './completionupdater.js'
import type { Logger } from './logger.js'
import type { Manager } from './manager.js'


export class DuplicateLabels {
    private readonly duplicatedLabelsDiagnostics = vscode.languages.createDiagnosticCollection('Duplicate Labels')

    constructor(private readonly extension: {
        readonly eventBus: EventBus,
        readonly completionUpdater: CompletionUpdater,
        readonly logger: Logger,
        readonly manager: Manager
    }) {
        this.extension = extension
        this.extension.eventBus.completionUpdated.event((file: string) => {
            const configuration = vscode.workspace.getConfiguration('latex-toybox')
            if (configuration.get('check.duplicatedLabels.enabled')) {
                this.run(file)
            }
        })
    }

    /**
     * Compute the dictionary of labels holding their file and position
     */
    private computeDuplicates(file: string): string[] {
        if (!this.extension.manager.getCachedContent(file)) {
            this.extension.logger.info(`Cannot check for duplicate labels in a file not in manager: ${file}.`)
            return []
        }
        const labelsCount = new Map<string, number>()
        this.extension.manager.getIncludedTeX().forEach(cachedFile => {
            const cachedRefs = this.extension.manager.getCachedContent(cachedFile)?.element.labelDefinition
            cachedRefs?.forEach(ref => {
                let count = labelsCount.get(ref.label)
                if (count === undefined) {
                    count = 0
                }
                count += 1
                labelsCount.set(ref.label, count)
            })
        })
        const duplicates = []
        for (const [label, count] of labelsCount) {
            if (count > 1) {
                duplicates.push(label)
            }
        }
        return duplicates
    }

    run(file: string) {
        this.extension.logger.info(`Checking for duplicate labels: ${file}.`)
        const duplicates = this.computeDuplicates(file)
        this.showDiagnostics(duplicates)
    }

    private showDiagnostics(duplicates: string[]) {
        this.duplicatedLabelsDiagnostics.clear()
        if (duplicates.length === 0) {
            return
        }
        const diagsCollection = Object.create(null) as { [key: string]: vscode.Diagnostic[] }

        this.extension.manager.getIncludedTeX().forEach(cachedFile => {
            const cachedRefs = this.extension.manager.getCachedContent(cachedFile)?.element.labelDefinition
            if (cachedRefs === undefined) {
                return
            }
            cachedRefs.forEach(ref => {
                if (duplicates.includes(ref.label)) {
                   if (! (cachedFile in diagsCollection)) {
                        diagsCollection[cachedFile] = []
                    }
                    const range = ref.range
                    const diag = new vscode.Diagnostic(range, `Duplicate label ${ref.label}`, vscode.DiagnosticSeverity.Warning)
                    diag.source = 'DuplicateLabels'
                    diagsCollection[cachedFile].push(diag)
                }
            })
        })

        for (const file in diagsCollection) {
            if (path.extname(file) === '.tex') {
                this.duplicatedLabelsDiagnostics.set(vscode.Uri.file(file), diagsCollection[file])
            }
        }
    }

    reset() {
        this.duplicatedLabelsDiagnostics.clear()
    }
}
