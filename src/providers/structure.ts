import * as vscode from 'vscode'

import type { Extension } from '../main'
import { SectionNodeProvider } from './structurelib/sectionnodeprovider'

export enum SectionKind {
    Env = 0,
    Label = 1,
    Section = 2,
    NoNumberSection = 3
}

export class Section extends vscode.TreeItem {

    public children: Section[] = []
    public parent: Section | undefined = undefined // The parent of a top level section must be undefined
    public subfiles: string[] = []

    constructor(
        public readonly kind: SectionKind,
        public label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly depth: number,
        public readonly lineNumber: number,
        public lastLine: number,
        public readonly fileName: string,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState)
    }
}

export class StructureTreeView {
    private readonly extension: Extension
    private readonly treeView: vscode.TreeView<Section | undefined>
    private readonly sectionNodeProvider: SectionNodeProvider
    private followCursor: boolean = true

    constructor(extension: Extension) {
        this.extension = extension
        this.sectionNodeProvider = new SectionNodeProvider(extension)
        this.treeView = vscode.window.createTreeView('latex-workshop-structure', { treeDataProvider: this.sectionNodeProvider, showCollapseAll: true })

        extension.extensionContext.subscriptions.push(
            this.treeView,
            vscode.commands.registerCommand('latex-workshop.structure-toggle-follow-cursor', () => {
                this.followCursor = ! this.followCursor
                this.extension.logger.info(`Follow cursor is set to ${this.followCursor}.`)
            }),
            vscode.workspace.onDidSaveTextDocument( (e: vscode.TextDocument) => {
                if (extension.manager.hasBibtexId(e.languageId)) {
                    void this.computeTreeStructure()
                }
            }),
            vscode.window.onDidChangeActiveTextEditor((e: vscode.TextEditor | undefined) => {
                if (e && extension.manager.hasBibtexId(e.document.languageId)) {
                    void this.refreshView()
                }
            }),
            vscode.window.onDidChangeTextEditorSelection((e: vscode.TextEditorSelectionChangeEvent) => {
                if (extension.manager.hasTexId(e.textEditor.document.languageId) || e.textEditor.document.languageId === 'bibtex') {
                    return this.showCursorItem(e)
                }
                return
            }),
            vscode.workspace.onDidChangeConfiguration((e: vscode.ConfigurationChangeEvent) => {
                if (e.affectsConfiguration('latex-workshop.view.outline')) {
                    void this.computeTreeStructure()
                }
            })
        )

        this.extension.eventBus.rootFileChanged.event(() => {
            void this.computeTreeStructure()
        })

        this.extension.eventBus.findRootFileEnd.event(() => {
            void this.refreshView()
        })
    }

    /**
     * Recompute the whole structure from file and update the view
     */
    private async computeTreeStructure() {
        await this.sectionNodeProvider.update(true)
    }

    /**
     * Refresh the view using cache
     */
    private async refreshView() {
        await this.sectionNodeProvider.update(false)
    }

    getTreeData(): Section[] {
        return this.sectionNodeProvider.ds
    }

    private traverseSectionTree(sections: Section[], fileName: string, lineNumber: number): Section | undefined {
        let match: Section | undefined = undefined
        for (const node of sections) {
            if ((node.fileName === fileName &&
                 node.lineNumber <= lineNumber && node.lastLine >= lineNumber) ||
                (node.fileName !== fileName && node.subfiles.includes(fileName))) {
                match = node
                // Look for a more precise surrounding section
                const res = this.traverseSectionTree(node.children, fileName, lineNumber)
                if (res) {
                    match = res
                }
            }
        }
        return match

    }

    private showCursorItem(e: vscode.TextEditorSelectionChangeEvent) {
        if (!this.followCursor || !this.treeView.visible) {
            return
        }
        const line = e.selections[0].active.line
        const f = e.textEditor.document.fileName
        const currentNode = this.traverseSectionTree(this.sectionNodeProvider.ds, f, line)
        if (currentNode) {
            return this.treeView.reveal(currentNode, {select: true})
        }
        return
    }
}
