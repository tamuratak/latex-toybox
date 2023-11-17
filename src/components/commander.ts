import * as vscode from 'vscode'
import type { Manager } from './manager.js'


export class LaTeXCommanderTreeView {
    private readonly latexCommanderProvider: LaTeXCommanderProvider

    constructor(extension: {
        readonly extensionContext: vscode.ExtensionContext,
        readonly manager: Manager
    }) {
        this.latexCommanderProvider = new LaTeXCommanderProvider(extension)
        extension.extensionContext.subscriptions.push(
            vscode.window.createTreeView(
                'latex-toybox-commands',
                {
                    treeDataProvider: this.latexCommanderProvider,
                    showCollapseAll: true
                }
            )
        )
    }

    update() {
        this.latexCommanderProvider.update()
    }
}

class LaTeXCommanderProvider implements vscode.TreeDataProvider<LaTeXCommand> {
    private readonly treeDataEventEmitter: vscode.EventEmitter<LaTeXCommand | undefined> = new vscode.EventEmitter<LaTeXCommand | undefined>()
    readonly onDidChangeTreeData: vscode.Event<LaTeXCommand | undefined>
    private commands: LaTeXCommand[] = []

    constructor(private readonly extension: {
        readonly extensionContext: vscode.ExtensionContext,
        readonly manager: Manager
    }) {
        this.extension = extension
        this.onDidChangeTreeData = this.treeDataEventEmitter.event
        extension.extensionContext.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration((ev: vscode.ConfigurationChangeEvent) => {
                if (ev.affectsConfiguration('latex-toybox.latex.recipes', this.extension.manager.getWorkspaceFolderRootDir())) {
                    this.update()
                }
            }),
            this.treeDataEventEmitter
        )
        this.commands = this.buildCommandTree()
    }

    update() {
        this.commands = this.buildCommandTree()
        this.treeDataEventEmitter.fire(undefined)
    }

    private buildNode(parent: LaTeXCommand, children: LaTeXCommand[]) {
        if (children.length > 0) {
            parent.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed
            parent.children = children
            children.forEach((c) => c.parent = parent)
        }
        return parent
    }

    private buildCommandTree(): LaTeXCommand[] {
        const commands: LaTeXCommand[] = []
        const configuration = vscode.workspace.getConfiguration('latex-toybox', this.extension.manager.getWorkspaceFolderRootDir())

        const buildCommand = new LaTeXCommand('Build LaTeX project', {command: 'latex-toybox.build'}, 'debug-start')
        const recipes = configuration.get('latex.recipes', []) as {name: string}[]
        const recipeCommands = recipes.map(recipe => new LaTeXCommand(`Recipe: ${recipe.name}`, {command: 'latex-toybox.recipes', arguments: [recipe.name]}, 'debug-start'))
        let node: LaTeXCommand
        node = this.buildNode(buildCommand, [
            new LaTeXCommand('Terminate current compilation', {command: 'latex-toybox.kill'}, 'debug-stop'),
            ...recipeCommands
        ])
        commands.push(node)

        const viewCommand = new LaTeXCommand('View LaTeX PDF', {command: 'latex-toybox.view'}, 'open-preview')
        node = this.buildNode(viewCommand, [
            new LaTeXCommand('View in VSCode tab', {command: 'latex-toybox.view', arguments: ['tab']}, 'open-preview'),
            new LaTeXCommand('View in web browser', {command: 'latex-toybox.view', arguments: ['browser']}, 'browser'),
            new LaTeXCommand('View in external viewer', {command: 'latex-toybox.view', arguments: ['external']}, 'preview'),
            new LaTeXCommand('Refresh all viewers', {command: 'latex-toybox.refresh-viewer'}, 'refresh')
        ])
        commands.push(node)

        const logCommand = new LaTeXCommand('View Log messages', {command: 'latex-toybox.log'}, 'output')
        const compilerLog = new LaTeXCommand('View LaTeX compiler log', {command: 'latex-toybox.compilerlog'}, 'output')
        const latexToyboxLog = new LaTeXCommand('View LaTeX Toybox extension log', {command: 'latex-toybox.log'}, 'output')
        node = this.buildNode(logCommand, [
            latexToyboxLog,
            compilerLog
        ])
        commands.push(node)

        const navCommand = new LaTeXCommand('Navigate, select, and edit', undefined, 'edit')
        node= this.buildNode(navCommand, [
            new LaTeXCommand('SyncTeX from cursor', {command: 'latex-toybox.synctex'}, 'go-to-file'),
            new LaTeXCommand('Navigate to matching begin/end', {command: 'latex-toybox.navigate-envpair'}),
            new LaTeXCommand('Select current environment content', {command: 'latex-toybox.select-envcontent'}),
            new LaTeXCommand('Select current environment name', {command: 'latex-toybox.select-envname'}),
            new LaTeXCommand('Close current environment', {command: 'latex-toybox.close-env'}),
            new LaTeXCommand('Surround with begin{}...\\end{}', {command: 'latex-toybox.wrap-env'}),
        ])
        commands.push(node)

        const miscCommand = new LaTeXCommand('Miscellaneous', undefined, 'menu')
        node = this.buildNode(miscCommand, [
            new LaTeXCommand('Open citation browser', {command: 'latex-toybox.citation'}),
            new LaTeXCommand('Count words in LaTeX project', {command: 'latex-toybox.wordcount'}),
            new LaTeXCommand('Reveal output folder in OS', {command: 'latex-toybox.revealOutputDir'}, 'folder-opened')
        ])
        commands.push(node)

        const bibtexCommand = new LaTeXCommand('BibTeX actions', undefined, 'references')
        node = this.buildNode(bibtexCommand, [
            new LaTeXCommand('Align bibliography', {command: 'latex-toybox.bibalign'}),
            new LaTeXCommand('Sort bibliography', {command: 'latex-toybox.bibsort'}, 'sort-precedence'),
            new LaTeXCommand('Align and sort bibliography', {command: 'latex-toybox.bibalignsort'})
        ])
        commands.push(node)
        return commands
    }

    getTreeItem(element: LaTeXCommand): vscode.TreeItem {
        const treeItem: vscode.TreeItem = new vscode.TreeItem(element.label, element.collapsibleState)
        if (element.command) {
            treeItem.command = element.command
        }
        if (element.codicon) {
            treeItem.iconPath = new vscode.ThemeIcon(element.codicon)
        }
        return treeItem
    }

    getChildren(element?: LaTeXCommand): LaTeXCommand[] {
        if (!element) {
            return this.commands
        }

        return element.children
    }

    getParent(element: LaTeXCommand) {
        return element.parent
    }
}

class LaTeXCommand {
    public children: LaTeXCommand[] = []
    public readonly command: vscode.Command | undefined
    public collapsibleState = vscode.TreeItemCollapsibleState.None
    public parent: LaTeXCommand | undefined

    constructor(
        public readonly label: string,
        command?: {command: string, arguments?: string[]},
        public readonly codicon?: string
    ) {
        if (command) {
            this.command = {...command, title: ''}
        }
    }
}
