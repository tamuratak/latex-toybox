import * as vscode from 'vscode'
import {bibtexParser} from 'latex-utensils'

import {BibtexUtils} from './bibtexformatterlib/bibtexutils'
import type {BibtexEntry} from './bibtexformatterlib/bibtexutils'
import { toVscodeRange } from '../utils/utensils'
import type { BibtexAstManager } from '../components/astmanager'
import type { Logger } from '../components/logger'
import type { LwStatusBarItem } from '../components/statusbaritem'


export class BibtexFormatter {

    readonly duplicatesDiagnostics: vscode.DiagnosticCollection
    diags: vscode.Diagnostic[]

    constructor(private readonly extension: {
        readonly extensionContext: vscode.ExtensionContext,
        readonly bibtexAstManager: BibtexAstManager,
        readonly logger: Logger,
        readonly statusbaritem: LwStatusBarItem
    }) {
        this.duplicatesDiagnostics = vscode.languages.createDiagnosticCollection('BibTeX')
        this.diags = []
        extension.extensionContext.subscriptions.push(
            vscode.commands.registerCommand('latex-toybox.bibsort', () => this.bibtexFormat(true, false)),
            vscode.commands.registerCommand('latex-toybox.bibalign', () => this.bibtexFormat(false, true)),
            vscode.commands.registerCommand('latex-toybox.bibalignsort', () => this.bibtexFormat(true, true))
        )
    }

    async bibtexFormat(sort: boolean, align: boolean) {
        if (!vscode.window.activeTextEditor) {
            this.extension.logger.info('Exit formatting. The active textEditor is undefined.')
            return
        }
        if (vscode.window.activeTextEditor.document.languageId !== 'bibtex') {
            this.extension.logger.info('Exit formatting. The active textEditor is not of bibtex type.')
            return
        }
        const doc = vscode.window.activeTextEditor.document
        const t0 = Date.now()
        this.duplicatesDiagnostics.clear()
        this.extension.logger.info('Start bibtex formatting on user request.')
        const edits = await this.formatDocument(doc, sort, align)
        if (edits.length === 0) {
            return
        }
        const edit = new vscode.WorkspaceEdit()
        edits.forEach(e => {
            edit.replace(doc.uri, e.range, e.newText)
        })

        void vscode.workspace.applyEdit(edit).then(success => {
            if (success) {
                this.duplicatesDiagnostics.set(doc.uri, this.diags)
                const t1 = Date.now()
                this.extension.logger.info(`BibTeX action successful. Took ${t1 - t0} ms.`)
            } else {
                void this.extension.logger.error('Something went wrong while processing the bibliography.')
            }
        })

    }

    public async formatDocument(document: vscode.TextDocument, sort: boolean, align: boolean, range?: vscode.Range): Promise<vscode.TextEdit[]> {
        // Get configuration
        const bibtexUtils = new BibtexUtils(this.extension, document.uri)
        const config = vscode.workspace.getConfiguration('latex-toybox', document)
        const handleDuplicates = config.get('bibtex-format.handleDuplicates') as 'Ignore Duplicates' | 'Highlight Duplicates' | 'Comment Duplicates'
        const lineOffset = range ? range.start.line : 0
        const columnOffset = range ? range.start.character : 0

        const ast = await this.extension.bibtexAstManager.getDocAst(document)
        if (!ast) {
            return []
        }
        // Create an array of entries and of their starting locations
        const entries: BibtexEntry[] = []
        const entryLocations: vscode.Range[] = []
        ast.content.forEach(item => {
            if (bibtexParser.isEntry(item) || bibtexParser.isStringEntry(item)) {
                entries.push(item)
                // latex-utilities uses 1-based locations whereas VSCode uses 0-based
                entryLocations.push(toVscodeRange(item.location))
            }
        })

        // Get the sorted locations
        let sortedEntryLocations: vscode.Range[] = []
        const duplicates = new Set<bibtexParser.Entry>()
        if (sort) {
            entries.sort(bibtexUtils.bibtexSort(duplicates)).forEach(entry => {
                sortedEntryLocations.push(toVscodeRange(entry.location))
            })
        } else {
            sortedEntryLocations = entryLocations
        }

        // Successively replace the text in the current location from the sorted location
        this.duplicatesDiagnostics.clear()
        const edits: vscode.TextEdit[] = []
        this.diags = []
        let lineDelta = 0
        let text: string
        let isDuplicate: boolean
        for (let i = 0; i < entries.length; i++) {
            if (align && bibtexParser.isEntry(entries[i])) {
                const entry: bibtexParser.Entry = entries[i] as bibtexParser.Entry
                text = bibtexUtils.bibtexFormat(entry)
            } else {
                text = document.getText(sortedEntryLocations[i])
            }

            if (bibtexParser.isEntry(entries[i])) {
                const entry = entries[i] as bibtexParser.Entry
                isDuplicate = duplicates.has(entry)
                if (isDuplicate && handleDuplicates !== 'Ignore Duplicates') {
                    if (handleDuplicates === 'Highlight Duplicates') {
                        const highlightRange: vscode.Range = new vscode.Range(
                            entryLocations[i].start.line + lineDelta + lineOffset,
                            entryLocations[i].start.character + columnOffset,
                            entryLocations[i].start.line + lineDelta + (sortedEntryLocations[i].end.line - sortedEntryLocations[i].start.line) + lineOffset,
                            entryLocations[i].end.character
                        )
                        this.diags.push(new vscode.Diagnostic(
                            highlightRange,
                            `Duplicate entry "${entry.internalKey}".`,
                            vscode.DiagnosticSeverity.Warning
                        ))
                    } else { // 'Comment Duplicates'
                        // Log duplicate entry since we aren't highlighting it
                        this.extension.logger.info(
                            `BibTeX-format: Duplicate entry "${entry.internalKey}" at line ${entryLocations[i].start.line + lineDelta + 1 + lineOffset}.`)
                        text = text.replace(/@/,'')
                    }
                }
            }

            // Put text from entry[i] into (sorted)location[i]
            edits.push(new vscode.TextEdit(new vscode.Range(entryLocations[i].start.translate(range?.start.line, range?.start.character), entryLocations[i].end.translate(range?.start.line)), text))

            // We need to figure out the line changes in order to highlight properly
            lineDelta += (sortedEntryLocations[i].end.line - sortedEntryLocations[i].start.line) - (entryLocations[i].end.line - entryLocations[i].start.line)
        }
        this.extension.logger.info('Formatted ' + document.fileName)
        return edits
    }
}

export class BibtexFormatterProvider implements vscode.DocumentFormattingEditProvider, vscode.DocumentRangeFormattingEditProvider {
    private readonly formatter: BibtexFormatter

    constructor(private readonly extension: ConstructorParameters<typeof BibtexFormatter>[0]) {
        this.formatter = new BibtexFormatter(extension)
    }

    public provideDocumentFormattingEdits(document: vscode.TextDocument): Promise<vscode.TextEdit[]> {
        const sort = vscode.workspace.getConfiguration('latex-toybox', document).get('bibtex-format.sort.enabled') as boolean
        this.extension.logger.info('Start bibtex formatting on behalf of VSCode\'s formatter.')
        return this.formatter.formatDocument(document, sort, true)
    }

    public provideDocumentRangeFormattingEdits(document: vscode.TextDocument, range: vscode.Range): Promise<vscode.TextEdit[]> {
        const sort = vscode.workspace.getConfiguration('latex-toybox', document).get('bibtex-format.sort.enabled') as boolean
        this.extension.logger.info('Start bibtex selection formatting on behalf of VSCode\'s formatter.')
        return this.formatter.formatDocument(document, sort, true, range)
    }

}
