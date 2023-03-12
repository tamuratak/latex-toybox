import * as vscode from 'vscode'
import * as path from 'path'

import type {Extension} from './main'
import {TeXDoc} from './components/texdoc'


async function quickPickRootFile(rootFile: string, localRootFile: string): Promise<string | undefined> {
    const configuration = vscode.workspace.getConfiguration('latex-workshop', vscode.Uri.file(rootFile))
    const doNotPrompt = configuration.get('latex.rootFile.doNotPrompt') as boolean
    if (doNotPrompt) {
        if (configuration.get('latex.rootFile.useSubFile')) {
            return localRootFile
        } else {
            return rootFile
        }
    }
    const pickedRootFile = await vscode.window.showQuickPick([{
        label: 'Default root file',
        description: `Path: ${rootFile}`
    }, {
        label: 'Subfiles package root file',
        description: `Path: ${localRootFile}`
    }], {
        placeHolder: 'Subfiles package detected. Which file to build?',
        matchOnDescription: true
    }).then( selected => {
        if (!selected) {
            return undefined
        }
        switch (selected.label) {
            case 'Default root file':
                return rootFile
                break
            case 'Subfiles package root file':
                return localRootFile
                break
            default:
                return undefined
        }
    })
    return pickedRootFile
}

export class Commander {
    private readonly extension: Extension
    private readonly _texdoc: TeXDoc

    constructor(extension: Extension) {
        this.extension = extension
        this._texdoc = new TeXDoc(extension)
    }

    async build(skipSelection: boolean = false, rootFile: string | undefined = undefined, languageId: string | undefined = undefined, recipe: string | undefined = undefined) {
        this.extension.logger.info('BUILD command invoked.')
        if (!vscode.window.activeTextEditor) {
            this.extension.logger.info('Cannot start to build because the active editor is undefined.')
            return
        }
        this.extension.logger.info(`The document of the active editor: ${vscode.window.activeTextEditor.document.uri.toString(true)}`)
        this.extension.logger.info(`The languageId of the document: ${vscode.window.activeTextEditor.document.languageId}`)
        const workspace = rootFile ? vscode.Uri.file(rootFile) : vscode.window.activeTextEditor.document.uri
        const configuration = vscode.workspace.getConfiguration('latex-workshop', workspace)
        const externalBuildCommand = configuration.get('latex.external.build.command') as string
        const externalBuildArgs = configuration.get('latex.external.build.args') as string[]
        if (rootFile === undefined && this.extension.manager.hasTexId(vscode.window.activeTextEditor.document.languageId)) {
            rootFile = await this.extension.manager.rootFilePromise
            languageId = this.extension.manager.rootFileLanguageId
        }
        if (externalBuildCommand) {
            const pwd = path.dirname(rootFile ? rootFile : vscode.window.activeTextEditor.document.fileName)
            await this.extension.builder.buildWithExternalCommand(externalBuildCommand, externalBuildArgs, pwd, rootFile)
            return
        }
        if (rootFile === undefined || languageId === undefined) {
            this.extension.logger.error('Cannot find LaTeX root file. See https://github.com/James-Yu/LaTeX-Workshop/wiki/Compile#the-root-file')
            return
        }
        let pickedRootFile: string | undefined = rootFile
        if (!skipSelection && this.extension.manager.localRootFile) {
            // We are using the subfile package
            pickedRootFile = await quickPickRootFile(rootFile, this.extension.manager.localRootFile)
            if (! pickedRootFile) {
                return
            }
        }
        this.extension.logger.info(`Building root file: ${pickedRootFile}`)
        await this.extension.builder.build(pickedRootFile, languageId, recipe)
    }

    async revealOutputDir() {
        let outDir = this.extension.manager.getOutDir()
        if (!path.isAbsolute(outDir)) {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
            const rootDir = this.extension.manager.rootDir || workspaceFolder?.uri.fsPath
            if (rootDir === undefined) {
                this.extension.logger.info(`Cannot reveal ${vscode.Uri.file(outDir)}: no root dir can be identified.`)
                return
            }
            outDir = path.resolve(rootDir, outDir)
        }
        this.extension.logger.info(`Reveal ${vscode.Uri.file(outDir)}`)
        await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(outDir))
    }

    recipes(recipe?: string) {
        this.extension.logger.info('RECIPES command invoked.')
        const configuration = vscode.workspace.getConfiguration('latex-workshop', this.extension.manager.getWorkspaceFolderRootDir())
        const recipes = configuration.get('latex.recipes') as {name: string}[]
        if (!recipes) {
            return
        }
        if (recipe) {
            return this.build(false, undefined, undefined, recipe)
        }
        return vscode.window.showQuickPick(recipes.map(candidate => candidate.name), {
            placeHolder: 'Please Select a LaTeX Recipe'
        }).then(selected => {
            if (!selected) {
                return
            }
            return this.build(false, undefined, undefined, selected)
        })
    }

    async view(mode?: 'tab' | 'browser' | 'external' | vscode.Uri) {
        if (mode) {
            this.extension.logger.info(`VIEW command invoked with mode: ${mode}.`)
        } else {
            this.extension.logger.info('VIEW command invoked.')
        }
        if (!vscode.window.activeTextEditor) {
            this.extension.logger.info('Cannot find active TextEditor.')
            return
        }
        if (!this.extension.manager.hasTexId(vscode.window.activeTextEditor.document.languageId)) {
            this.extension.logger.info('Active document is not a TeX file.')
            return
        }
        const rootFile = this.extension.manager.rootFile
        if (rootFile === undefined) {
            this.extension.logger.info('Cannot find LaTeX root PDF to view.')
            return
        }
        let pickedRootFile: string | undefined = rootFile
        if (this.extension.manager.localRootFile) {
            // We are using the subfile package
            pickedRootFile = await quickPickRootFile(rootFile, this.extension.manager.localRootFile)
        }
        if (!pickedRootFile) {
            return
        }
        const configuration = vscode.workspace.getConfiguration('latex-workshop')
        const tabEditorGroup = configuration.get('view.pdf.tab.editorGroup') as string
        const viewer = typeof mode === 'string' ? mode : configuration.get<'tab' | 'browser' | 'external'>('view.pdf.viewer', 'tab')
        if (viewer === 'browser') {
            return this.extension.viewer.openBrowser(pickedRootFile)
        } else if (viewer === 'tab') {
            return this.extension.viewer.openTab(pickedRootFile, true, tabEditorGroup)
        } else if (viewer === 'external') {
            this.extension.viewer.openExternal(pickedRootFile)
            return
        }
        return
    }

    refresh() {
        this.extension.logger.info('REFRESH command invoked.')
        this.extension.viewer.refreshExistingViewer()
    }

    kill() {
        this.extension.logger.info('KILL command invoked.')
        this.extension.builder.kill()
    }

    pdf(uri: vscode.Uri | undefined) {
        this.extension.logger.info('PDF command invoked.')
        if (uri === undefined || !uri.fsPath.endsWith('.pdf')) {
            return
        }
        return this.extension.viewer.openPdfInTab(uri, 'current', false)
    }

    synctex() {
        try {
            this.extension.logger.info('SYNCTEX command invoked.')
            if (!vscode.window.activeTextEditor || !this.extension.manager.hasTexId(vscode.window.activeTextEditor.document.languageId)) {
                this.extension.logger.info('Cannot start SyncTeX. The active editor is undefined, or the document is not a TeX document.')
                return
            }
            const configuration = vscode.workspace.getConfiguration('latex-workshop', this.extension.manager.getWorkspaceFolderRootDir())
            let pdfFile: string | undefined = undefined
            if (this.extension.manager.localRootFile && configuration.get('latex.rootFile.useSubFile')) {
                pdfFile = this.extension.manager.tex2pdf(this.extension.manager.localRootFile)
            } else if (this.extension.manager.rootFile !== undefined) {
                pdfFile = this.extension.manager.tex2pdf(this.extension.manager.rootFile)
            }
            return this.extension.locator.syncTeX(undefined, undefined, pdfFile)
        } catch(e) {
            if (e instanceof Error) {
                this.extension.logger.logError(e)
            }
            throw e
        }
    }

    synctexonref(line: number, filePath: string) {
        this.extension.logger.info('SYNCTEX command invoked on a reference.')
        if (!vscode.window.activeTextEditor || !this.extension.manager.hasTexId(vscode.window.activeTextEditor.document.languageId)) {
            this.extension.logger.info('Cannot start SyncTeX. The active editor is undefined, or the document is not a TeX document.')
            return
        }
        return this.extension.locator.syncTeXOnRef({line, filePath})
    }

    citation() {
        this.extension.logger.info('CITATION command invoked.')
        return this.extension.completer.citation.browser()
    }

    log(compiler?: string) {
        this.extension.logger.info(`LOG command invoked: ${compiler || 'default'}`)
        if (compiler) {
            this.extension.compilerLog.show()
            return
        }
        this.extension.logger.showLog()
    }

    gotoSection(filePath: string, lineNumber: number) {
        this.extension.logger.info(`GOTOSECTION command invoked. Target ${filePath}, line ${lineNumber}`)
        const activeEditor = vscode.window.activeTextEditor

        void vscode.workspace.openTextDocument(filePath).then((doc) => {
            void vscode.window.showTextDocument(doc).then(() => {
                // input lineNumber is one-based, while editor position is zero-based.
                void vscode.commands.executeCommand('revealLine', {lineNumber, at: 'center'})
                if (activeEditor) {
                    activeEditor.selection = new vscode.Selection(new vscode.Position(lineNumber, 0), new vscode.Position(lineNumber, 0))
                }
            })
        })

    }

    navigateToEnvPair() {
        this.extension.logger.info('JumpToEnvPair command invoked.')
        if (!vscode.window.activeTextEditor || !this.extension.manager.hasTexId(vscode.window.activeTextEditor.document.languageId)) {
            return
        }
        return this.extension.envPair.gotoPair()
    }

    selectEnvName() {
        this.extension.logger.info('SelectEnvName command invoked.')
        if (!vscode.window.activeTextEditor || !this.extension.manager.hasTexId(vscode.window.activeTextEditor.document.languageId)) {
            return
        }
        return this.extension.envPair.envNameAction()
    }

    closeEnv() {
        this.extension.logger.info('CloseEnv command invoked.')
        if (!vscode.window.activeTextEditor || !this.extension.manager.hasTexId(vscode.window.activeTextEditor.document.languageId)) {
            return
        }
        return this.extension.envPair.closeEnv()
    }

    actions() {
        this.extension.logger.info('ACTIONS command invoked.')
        return vscode.commands.executeCommand('workbench.view.extension.latex-workshop-activitybar').then(() => vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup'))
    }

    /**
     * If the current line starts with \item or \item[], do the same for
     * the new line when hitting enter.
     * Note that hitting enter on a line containing only \item or \item[]
     * actually deletes the content of the line.
     */
    onEnterKey(modifiers?: string) {
        const editor = vscode.window.activeTextEditor
        if (!editor) {
            return
        }
        const configuration = vscode.workspace.getConfiguration('latex-workshop')
        if (!configuration.get('bind.enter.key')) {
            return vscode.commands.executeCommand('type', { source: 'keyboard', text: '\n' })
        }
        if (modifiers === 'alt') {
            return vscode.commands.executeCommand('editor.action.insertLineAfter')
        }

        // Test if every cursor is at the end of a line starting with \item
        const allCursorsOnItem = editor.selections.every((selection: vscode.Selection) => {
                const cursorPos = selection.active
                const line = editor.document.lineAt(cursorPos.line)
                return /^\s*\\item/.test(line.text) && (line.text.substring(cursorPos.character).trim().length === 0)
        })
        if (!allCursorsOnItem) {
            return vscode.commands.executeCommand('type', { source: 'keyboard', text: '\n' })
        }

        return editor.edit(editBuilder => {
            // If we arrive here, all the cursors are at the end of a line starting with `\s*\\item`.
            // Yet, we keep the conditions for the sake of maintenance.
            for (const selection of editor.selections) {
                const cursorPos = selection.active
                const line = editor.document.lineAt(cursorPos.line)
                const indentation = line.text.substring(0, line.firstNonWhitespaceCharacterIndex)

                if (/^\s*\\item(\[\s*\])?\s*$/.test(line.text)) {
                    // The line is an empty \item or \item[]
                    const rangeToDelete = line.range.with(cursorPos.with(line.lineNumber, line.firstNonWhitespaceCharacterIndex), line.range.end)
                    editBuilder.delete(rangeToDelete)
                } else if(/^\s*\\item\[[^[\]]*\]/.test(line.text)) {
                    // The line starts with \item[blabla] or \item[] blabla
                    const itemString = `\n${indentation}\\item[] `
                    editBuilder.insert(cursorPos, itemString)
                } else if(/^\s*\\item\s*[^\s]+.*$/.test(line.text)) {
                    // The line starts with \item blabla
                    const itemString = `\n${indentation}\\item `
                    editBuilder.insert(cursorPos, itemString)
                } else {
                    // If we do not know what to do, insert a newline and indent using the current indentation
                    editBuilder.insert(cursorPos, `\n${indentation}`)
                }
            }
        })
    }

    /**
     * Shift the level sectioning in the selection by one (up or down)
     * @param change
     */
    shiftSectioningLevel(change: 'promote' | 'demote') {
       this.extension.section.shiftSectioningLevel(change)
    }

    selectSection() {
        this.extension.section.selectSection()
    }

    texdoc(pkg?: string) {
        this._texdoc.texdoc(pkg)
    }

    texdocUsepackages() {
        this._texdoc.texdocUsepackages()
    }

    async saveWithoutBuilding() {
        if (vscode.window.activeTextEditor === undefined) {
            return
        }
        await vscode.window.activeTextEditor.document.save()
    }

    openMathPreviewPanel() {
        return this.extension.mathPreviewPanel.open()
    }

    closeMathPreviewPanel() {
        this.extension.mathPreviewPanel.close()
    }

    toggleMathPreviewPanel() {
        this.extension.mathPreviewPanel.toggle()
    }

}
