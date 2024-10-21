import * as vscode from 'vscode'
import * as path from 'node:path'
import * as cp from 'node:child_process'
import { SyncTexJs } from './locatorlib/synctex.js'
import { replaceArgumentPlaceholders } from '../utils/utils.js'
import { isSameRealPath } from '../utils/pathnormalize.js'

import type { ClientRequest } from 'latex-toybox-protocol-types'
import { existsPath } from '../lib/lwfs/lwfs.js'
import { hasTexId } from '../utils/hastexid.js'
import type { Logger } from './logger.js'
import type { Manager } from './manager.js'
import type { Viewer } from './viewer.js'
import { ExternalPromise } from '../utils/externalpromise.js'
import { inspectCompact } from '../utils/inspect.js'
import { decodeXUserDefined } from '../utils/xuserdefined.js'
import { decodeUtf8 } from '../utils/utf8.js'

export interface SyncTeXRecordForward {
    page: number,
    x: number,
    y: number
}

export interface SyncTeXRecordBackward {
    input: string,
    line: number,
    column: number
}

export class Locator {
    private readonly synctexjs: SyncTexJs

    constructor(private readonly extension: {
        readonly logger: Logger,
        readonly manager: Manager,
        readonly viewer: Viewer
    }) {
        this.extension = extension
        this.synctexjs = new SyncTexJs(extension)
    }

    private parseSyncTeXForward(result: string): SyncTeXRecordForward {
        const record = Object.create(null) as { page?: number, x?: number, y?: number }
        let started = false
        for (const line of result.split('\n')) {
            if (line.includes('SyncTeX result begin')) {
                started = true
                continue
            }
            if (line.includes('SyncTeX result end')) {
                break
            }
            if (!started) {
                continue
            }
            const pos = line.indexOf(':')
            if (pos < 0) {
                continue
            }
            const key = line.substring(0, pos).toLowerCase()
            if (key !== 'page' && key !== 'x' && key !== 'y' ) {
                continue
            }
            const value = line.substring(pos + 1)
            record[key] = Number(value)
        }
        if (record.page !== undefined && record.x !== undefined && record.y !== undefined) {
            return { page: record.page, x: record.x, y: record.y, }
        } else {
            throw(new Error('parse error when parsing the result of synctex forward.'))
        }
    }

    private parseSyncTeXBackward(result: string): SyncTeXRecordBackward {
        const record = Object.create(null) as { input?: string, line?: number, column?: number }
        let started = false
        for (const line of result.split('\n')) {
            if (line.includes('SyncTeX result begin')) {
                started = true
                continue
            }
            if (line.includes('SyncTeX result end')) {
                break
            }
            if (!started) {
                continue
            }
            const pos = line.indexOf(':')
            if (pos < 0) {
                continue
            }
            const key = line.substring(0, pos).toLowerCase()
            if (key !== 'input' && key !== 'line' && key !== 'column' ) {
                continue
            }
            const value = line.substring(pos + 1)
            if (key === 'line' || key === 'column') {
                record[key] = Number(value)
                continue
            }
            record[key] = value
        }
        if (record.input !== undefined && record.line !== undefined && record.column !== undefined) {
            return { input: record.input, line: record.line, column: record.column }
        } else {
            throw(new Error('parse error when parsing the result of synctex backward.'))
        }
    }

    /**
     * Execute forward SyncTeX with respect to `args`.
     *
     * @param args The arguments of forward SyncTeX. If `undefined`, the document and the cursor position of `activeTextEditor` are used.
     * @param forcedViewer Indicates a PDF viewer with which SyncTeX is executed.
     * @param pdfFile The path of a PDF File compiled from the `filePath` of `args`. If `undefined`, it is automatically detected.
     */
    async syncTeX(args?: {line: number, filePath: string}, forcedViewer: 'auto' | 'tabOrBrowser' | 'external' = 'auto', pdfFile?: string) {
        let line: number
        let filePath: string
        let character = 0
        if (!vscode.window.activeTextEditor) {
            this.extension.logger.info('[Synctexjs] active editor not found')
            return
        }

        if (args === undefined) {
            filePath = vscode.window.activeTextEditor.document.uri.fsPath
            if (!hasTexId(vscode.window.activeTextEditor.document.languageId)) {
                this.extension.logger.info(`${filePath} is not a valid LaTeX file.`)
                return
            }
            const position = vscode.window.activeTextEditor.selection.active
            if (!position) {
                this.extension.logger.info(`Cannot get cursor position: ${position}`)
                return
            }
            line = position.line + 1
            character = position.character
        } else {
            line = args.line
            filePath = args.filePath
        }
        const configuration = vscode.workspace.getConfiguration('latex-toybox')
        const rootFile = this.extension.manager.rootFile
        if (rootFile === undefined) {
            this.extension.logger.info('Cannot find root file.')
            return
        }
        if (!pdfFile) {
            pdfFile = this.extension.manager.tex2pdf(rootFile)
        }
        if (vscode.window.activeTextEditor.document.lineCount === line &&
            vscode.window.activeTextEditor.document.lineAt(line - 1).text === '') {
                line -= 1
        }
        if (forcedViewer === 'external' || (forcedViewer === 'auto' && configuration.get('view.pdf.viewer') === 'external') ) {
            this.syncTeXExternal(line, pdfFile, rootFile)
            return
        }

        const useSyncTexJs = configuration.get('synctex.synctexjs.enabled') as boolean

        if (useSyncTexJs) {
            try {
                const record = await this.synctexjs.syncTexJsForward(line, filePath, pdfFile)
                this.extension.viewer.syncTeX(pdfFile, record)
            } catch (e) {
                this.extension.logger.info('[SyncTexJs] Forward SyncTeX failed.')
                this.extension.logger.logError(e)
            }
        } else {
            const record = await this.invokeSyncTeXCommandForward(line, character, filePath, pdfFile)
            this.extension.viewer.syncTeX(pdfFile, record)
        }
    }

    private invokeSyncTeXCommandForward(line: number, col: number, filePath: string, pdfFile: string): Thenable<SyncTeXRecordForward> {
        const configuration = vscode.workspace.getConfiguration('latex-toybox')
        const args = ['view', '-i', `${line}:${col + 1}:${filePath}`, '-o', pdfFile]
        this.extension.logger.info(`Execute synctex with args ${inspectCompact(args)}`)

        const command = configuration.get('synctex.path') as string
        const proc = cp.spawn(command, args, {cwd: path.dirname(pdfFile)})

        let stdout = ''
        proc.stdout.on('data', (newStdout: Uint8Array) => {
            stdout += decodeXUserDefined(newStdout)
        })

        let stderr = ''
        proc.stderr.on('data', (newStderr: Uint8Array) => {
            stderr += decodeUtf8(newStderr)
        })

        const resultPromise = new ExternalPromise<SyncTeXRecordForward>()

        proc.on('error', err => {
            this.extension.logger.info(`Cannot synctex: ${err.message}, ${stderr}`)
            resultPromise.reject(err)
        })

        proc.on('exit', exitCode => {
            if (exitCode !== 0) {
                this.extension.logger.info(`Cannot synctex, code: ${exitCode}, ${stderr}`)
            } else {
                resultPromise.resolve(this.parseSyncTeXForward(stdout))
            }
        })

        return resultPromise.promise
    }

    syncTeXOnRef(args: {line: number, filePath: string}) {
        const configuration = vscode.workspace.getConfiguration('latex-toybox')
        const viewer = configuration.get('view.pdf.ref.viewer') as 'auto' | 'tabOrBrowser' | 'external'
        args.line += 1
        if (viewer) {
            return this.syncTeX(args, viewer)
        } else {
            return this.syncTeX(args)
        }
    }

    private invokeSyncTeXCommandBackward(page: number, x: number, y: number, pdfPath: string): Thenable<SyncTeXRecordBackward> {
        const configuration = vscode.workspace.getConfiguration('latex-toybox')

        const args = ['edit', '-o', `${page}:${x}:${y}:${pdfPath}`]
        this.extension.logger.info(`Executing synctex with args: ${inspectCompact(args)}`)

        const command = configuration.get('synctex.path') as string
        const proc = cp.spawn(command, args, {cwd: path.dirname(pdfPath)})

        let stdout = ''
        proc.stdout.on('data', (newStdout: Uint8Array) => {
            stdout += decodeXUserDefined(newStdout)
        })

        let stderr = ''
        proc.stderr.on('data', (newStderr: Uint8Array) => {
            stderr += decodeUtf8(newStderr)
        })

        const resultPromise = new ExternalPromise<SyncTeXRecordBackward>

        proc.on('error', err => {
            this.extension.logger.info(`Cannot reverse synctex: ${err.message}, ${stderr}`)
            resultPromise.reject(err)
        })

        proc.on('exit', exitCode => {
            if (exitCode !== 0) {
                this.extension.logger.info(`Cannot reverse synctex, code: ${exitCode}, ${stderr}`)
            } else {
                const record = this.parseSyncTeXBackward(stdout)
                resultPromise.resolve(record)
            }
        })

        return resultPromise.promise
    }

    /**
     * Execute backward SyncTeX.
     *
     * @param data The page number and the position on the page of a PDF file.
     * @param pdfPath The path of a PDF file as the input of backward SyncTeX.
     */
    async locate(data: Extract<ClientRequest, {type: 'reverse_synctex'}>, pdfPath: string) {
        const configuration = vscode.workspace.getConfiguration('latex-toybox')
        const useSyncTexJs = configuration.get('synctex.synctexjs.enabled') as boolean
        let record: SyncTeXRecordBackward

        if (useSyncTexJs) {
            try {
                record = await this.synctexjs.syncTexJsBackward(Number(data.page), data.pos[0], data.pos[1], pdfPath)
            } catch (e) {
                this.extension.logger.info('[SyncTexJs] Backward SyncTeX failed.')
                this.extension.logger.logError(e)
                return
            }
        } else {
            record = await this.invokeSyncTeXCommandBackward(data.page, data.pos[0], data.pos[1], pdfPath)
        }
        record.input = record.input.replace(/(\r\n|\n|\r)/gm, '')

        // kpathsea/SyncTeX follow symlinks.
        // see http://tex.stackexchange.com/questions/25578/why-is-synctex-in-tl-2011-so-fussy-about-filenames.
        // We compare the return of symlink with the files list in the texFileTree and try to pickup the correct one.
        for (const ed of this.extension.manager.cachedFilePaths) {
            try {
                if (await isSameRealPath(record.input, ed)) {
                    record.input = ed
                    break
                }
            } catch (e) {
                this.extension.logger.error(`[SyncTexJs] isSameRealPath throws error: ${record.input} and ${ed}`)
                this.extension.logger.logError(e)
            }
        }

        const filePath = path.resolve(record.input)
        this.extension.logger.info(`SyncTeX to file ${filePath}`)
        if (!await existsPath(filePath)) {
            this.extension.logger.info(`Not found: ${filePath}`)
            return
        }
        try {
            const doc = await vscode.workspace.openTextDocument(filePath)
            let row = record.line - 1
            let col = record.column < 0 ? 0 : record.column
            // columns are typically not supplied by SyncTex, this could change in the future for some engines though
            if (col === 0) {
                [row, col] = this.getRowAndColumn(doc, row, data.textBeforeSelection, data.textAfterSelection)
            }
            const pos = new vscode.Position(row, col)

            const tab = this.findTab(doc)
            const viewColumn = tab?.group.viewColumn ?? this.getViewColumnOfVisibleTextEditor() ?? vscode.ViewColumn.Beside
            const editor = await vscode.window.showTextDocument(doc, viewColumn)
            editor.selection = new vscode.Selection(pos, pos)
            await vscode.commands.executeCommand('revealLine', {lineNumber: row, at: 'center'})
            this.animateToNotify(editor, pos)
        } catch (e) {
            this.extension.logger.logError(e)
        }
    }

    private findTab(doc: vscode.TextDocument): vscode.Tab | undefined {
        let notActive: vscode.Tab[] = []
        const docUriString = doc.uri.toString()
        for (const tabGroup of vscode.window.tabGroups.all) {
            for (const tab of tabGroup.tabs) {
                const tabInput = tab.input
                if (tabInput instanceof vscode.TabInputText) {
                    if (docUriString === tabInput.uri.toString()) {
                        if (tab.isActive) {
                            return tab
                        } else {
                            notActive.push(tab)
                        }
                    }
                }
            }
        }
        notActive = notActive.sort((a, b) => Math.max(a.group.viewColumn, 0) - Math.max(b.group.viewColumn, 0) )
        return notActive[0] || undefined
    }

    private getViewColumnOfVisibleTextEditor(): vscode.ViewColumn | undefined {
        const viewColumnArray = vscode.window.visibleTextEditors
                                .map((editor) => editor.viewColumn)
                                .filter((column): column is vscode.ViewColumn => column !== undefined)
                                .sort()
        return viewColumnArray[0]
    }

    private getRowAndColumn(doc: vscode.TextDocument, row: number, textBeforeSelectionFull: string, textAfterSelectionFull: string) {
        let tempCol = this.getColumnBySurroundingText(doc.lineAt(row).text, textBeforeSelectionFull, textAfterSelectionFull)
        if (tempCol !== null) {
            return [row, tempCol]
        }

        if (row - 1 >= 0) {
            tempCol = this.getColumnBySurroundingText(doc.lineAt(row - 1).text, textBeforeSelectionFull, textAfterSelectionFull)
            if (tempCol !== null) {
                return [row - 1, tempCol]
            }
        }

        if (row + 1 < doc.lineCount) {
            tempCol = this.getColumnBySurroundingText(doc.lineAt(row + 1).text, textBeforeSelectionFull, textAfterSelectionFull)
            if (tempCol !== null) {
                return [row + 1, tempCol]
            }
        }

        return [row, 0]
    }

    private getColumnBySurroundingText(line: string, textBeforeSelectionFull: string, textAfterSelectionFull: string) {
        let previousColumnMatches = Object.create(null) as Record<string, number>

        for (let length = 5; length <= Math.max(textBeforeSelectionFull.length, textAfterSelectionFull.length); length++) {
            const columns: number[] = []
            const textBeforeSelection = textBeforeSelectionFull.substring(textBeforeSelectionFull.length - length, textBeforeSelectionFull.length)
            const textAfterSelection = textAfterSelectionFull.substring(0, length)

            // Get all indexes for the before and after text
            if (textBeforeSelection !== '') {
                columns.push(...this.indexes(line, textBeforeSelection).map(index => index + textBeforeSelection.length))
            }
            if (textAfterSelection !== '') {
                columns.push(...this.indexes(line, textAfterSelection))
            }

            // Get number or occurrences for each column
            const columnMatches = Object.create(null) as Record<string, number>
            columns.forEach(column => columnMatches[column] = (columnMatches[column] || 0) + 1)
            const values = Object.values(columnMatches).sort()

            // At least two matches with equal fit
            if (values.length > 1 && values[0] === values[1]) {
                previousColumnMatches = columnMatches
                continue
            }
            // Only one match or one best match
            if (values.length >= 1) {
                return parseInt(Object.keys(columnMatches).reduce((a, b) => {
                    return columnMatches[a] > columnMatches[b] ? a : b
                }))
            }
            // No match in current iteration, return first best match from previous run or 0
            if (Object.keys(previousColumnMatches).length > 0) {
                return parseInt(Object.keys(previousColumnMatches).reduce((a, b) => {
                    return previousColumnMatches[a] > previousColumnMatches[b] ? a : b
                }))
            } else {
                return null
            }
        }
        // Should never be reached
        return null
    }

    private indexes(source: string, find: string) {
        const result: number[] = []
        for (let i = 0; i < source.length; ++i) {
            if (source.substring(i, i + find.length) === find) {
                result.push(i)
            }
        }
        return result
    }

    private animateToNotify(editor: vscode.TextEditor, position: vscode.Position) {
        const decoConfig = {
            borderWidth: '1px',
            borderStyle: 'solid',
            light: {
                borderColor: 'red'
            },
            dark: {
                borderColor: 'white'
            }
        }
        const range = new vscode.Range(position.line, 0, position.line, 65535)
        const deco = vscode.window.createTextEditorDecorationType(decoConfig)
        editor.setDecorations(deco, [range])
        setTimeout(() => { deco.dispose() }, 500)
    }

    private syncTeXExternal(line: number, pdfFile: string, rootFile: string) {
        if (!vscode.window.activeTextEditor) {
            return
        }
        const texFile = vscode.window.activeTextEditor.document.uri.fsPath
        const configuration = vscode.workspace.getConfiguration('latex-toybox')
        const command = configuration.get('view.pdf.external.synctex.command') as string
        let args = configuration.get('view.pdf.external.synctex.args') as string[]
        if (command === '') {
            this.extension.logger.error('Error: the external SyncTeX command is an empty string. Set view.pdf.external.synctex.command')
            return
        }
        if (args) {
            args = args.map(arg => {
                return replaceArgumentPlaceholders(rootFile)(arg)
                        .replace(/%PDF%/g, pdfFile)
                        .replace(/%LINE%/g, line.toString())
                        .replace(/%TEX%/g, texFile)
            })
        }
        this.extension.logger.info(`Open external viewer for syncTeX from ${pdfFile}`)
        this.extension.logger.logCommand('Execute external SyncTeX command', command, args)
        const proc = cp.spawn(command, args)
        let stdout = ''
        proc.stdout.on('data', (newStdout: Uint8Array) => {
            stdout += decodeUtf8(newStdout)
        })
        let stderr = ''
        proc.stderr.on('data', (newStderr: Uint8Array) => {
            stderr += decodeUtf8(newStderr)
        })
        const cb = () => {
            void this.extension.logger.info(`The external SyncTeX command stdout: ${stdout}`)
            void this.extension.logger.info(`The external SyncTeX command stderr: ${stderr}`)
        }
        proc.on('error', cb)
        proc.on('exit', cb)
    }
}
