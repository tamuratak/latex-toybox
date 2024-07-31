import * as vscode from 'vscode'
import * as path from 'node:path'
import { latexParser } from 'latex-utensils'
import { Section, SectionKind } from '../structure.js'
import { findFileInDirs } from '../../utils/utils.js'
import { buildLaTeXHierarchy } from './sectionnodeproviderlib/structure.js'
import { setLastLineOfEachSection } from './sectionnodeproviderlib/utils.js'
import { captionify, findEnvCaption } from './sectionnodeproviderlib/caption.js'
import { getDirtyContent } from '../../utils/getdirtycontent.js'
import type { Logger } from '../logger.js'
import type { Manager } from '../manager.js'
import type { LatexAstManager } from '../astmanager.js'


export class SectionNodeProvider implements vscode.TreeDataProvider<Section> {

    private readonly _onDidChangeTreeData: vscode.EventEmitter<Section | undefined> = new vscode.EventEmitter<Section | undefined>()
    readonly onDidChangeTreeData: vscode.Event<Section | undefined>
    public root: string = ''

    // our data source is a set multi-rooted set of trees
    public ds: Section[] = []
    private CachedLaTeXData: Section[] = []

    // The LaTeX commands to be extracted.
    private LaTeXCommands: {cmds: string[], envs: string[], secs: string[]} = {cmds: [], envs: [], secs: []}
    // The correspondance of section types and depths. Start from zero is
    // the top-most section (e.g., chapter). -1 is reserved for non-section
    // commands.
    private readonly LaTeXSectionDepths: Record<string, number> = {}

    constructor(private readonly extension: {
        readonly extensionContext: vscode.ExtensionContext,
        readonly logger: Logger,
        readonly manager: Manager,
        readonly latexAstManager: LatexAstManager
    }) {
        this.onDidChangeTreeData = this._onDidChangeTreeData.event
        extension.extensionContext.subscriptions.push(
            this._onDidChangeTreeData
        )
    }

    /**
     * Return the latex or bibtex structure
     *
     * @param force If `false` and some cached data exists for the corresponding file, use it. If `true`, always recompute the structure from disk
     */
    async build(force: boolean): Promise<Section[]> {
        if (this.extension.manager.rootFile) {
            if (force) {
                this.CachedLaTeXData = await this.buildLaTeXModel()
            }
            this.ds = this.CachedLaTeXData
        } else {
            this.ds = []
        }
        return this.ds
    }

    async update(force: boolean) {
        this.ds = await this.build(force)
        this._onDidChangeTreeData.fire(undefined)
    }

    private refreshLaTeXModelConfig() {
        const configuration = vscode.workspace.getConfiguration('latex-toybox')
        const cmds = configuration.get('view.outline.commands') as string[]
        const envs = configuration.get('view.outline.floats.enabled') as boolean ? ['figure', 'frame', 'table'] : ['frame']

        const hierarchy = (configuration.get('view.outline.sections') as string[])
        hierarchy.forEach((sec, index) => {
            sec.split('|').forEach(cmd => {
                this.LaTeXSectionDepths[cmd] = index
            })
        })

        this.LaTeXCommands = {cmds, envs, secs: hierarchy.map(sec => sec.split('|')).flat()}
    }

    /**
     *
     * This function is responsible for parsing the Abstract Syntax Tree (AST) of
     * a LaTeX document to build its structure. The process involves two steps.
     * In the first step, all AST nodes are traversed and filtered to build an array
     * of sections that will appear in the Visual Studio Code (VSCode) view,
     * but without any hierarchy. In the second step, the hierarchy is constructed
     * based on the configuration specified in `view.outline.sections`. The resulting
     * structure is used to display the document's outline in the VSCode view.
     *
     * @param file The base file to start building the structure. If left
     * `undefined`, the current `rootFile` is used, i.e., build the structure
     * for the whole document/project.
     * @param subFile Whether subfiles should be included in the structure.
     * Default is `true`. If true, all input/subfile/subimport-like commands
     * will be parsed.
     * @returns An array of {@link Section} to be shown in vscode view.
     */
    async buildLaTeXModel(file?: string, subFile = true): Promise<Section[]> {
        file = file ? file : this.extension.manager.rootFile
        if (!file) {
            return []
        }

        this.refreshLaTeXModelConfig()
        // To avoid looping import, this variable is used to store file paths
        // that have been parsed.
        const filesBuilt = new Set<string>()

        // Step 1: Create a flat array of sections.
        const flatStructure = await this.buildLaTeXSectionFromFile(file, subFile, filesBuilt)

        // Step 2: Create the hierarchy of these sections.
        const structure = buildLaTeXHierarchy(
            flatStructure,
            subFile && vscode.workspace.getConfiguration('latex-toybox').get('view.outline.numbers.enabled') as boolean
        )

        // Step 3: Determine the lastLine of all sections.
        setLastLineOfEachSection(structure, Number.MAX_SAFE_INTEGER)

        return structure
    }

    /**
     * This function, different from {@link buildLaTeXModel}, focus on building
     * the structure of one particular file. Thus, recursive call is made upon
     * subfiles.
     *
     * @param file The LaTeX file whose AST is to be parsed.
     * @param subFile Whether the subfile-like commands should be considered.
     * @param filesBuilt The files that have already been parsed.
     * @returns A flat array of {@link Section} of this file.
     */
    private async buildLaTeXSectionFromFile(file: string, subFile: boolean, filesBuilt: Set<string>): Promise<Section[]> {
        // Skip if the file has already been parsed. This is to avoid indefinite
        // loop under the case that A imports B and B imports back A.
        if (filesBuilt.has(file)) {
            return []
        }
        filesBuilt.add(file)

        // `getDirtyContent` is used here. I did not check if this is
        // appropriate.
        const {content} = await getDirtyContent(file)
        if (!content) {
            this.extension.logger.error(`Error loading LaTeX during structuring: ${file}.`)
            return []
        }

        // Use `latex-utensils` to generate the AST.
        const ast = await this.extension.latexAstManager.getAst(vscode.Uri.file(file))
        if (!ast) {
            return []
        }

        // Parse each base-level node. If the node has contents, that function
        // will be called recursively.
        let sections: Section[] = []
        for (const node of ast.content) {
            sections = [
                ...sections,
                ...await this.parseLaTeXNode(node, file, subFile, filesBuilt)
            ]
        }

        return sections
    }

    /**
     * This function parses a particular LaTeX AST node and its sub-nodes
     * (contents by `latex-utensils`).
     *
     * @param node The AST node to be parsed.
     *
     * All other parameters are identical to {@link buildLaTeXSectionFromFile}.
     *
     * @returns A flat array of {@link Section} of this node.
     */
    private async parseLaTeXNode(node: latexParser.Node, file: string, subFile: boolean, filesBuilt: Set<string>): Promise<Section[]> {
        let sections: Section[] = []
        if (latexParser.isCommand(node)) {
            if (this.LaTeXCommands.secs.includes(node.name.replace(/\*$/, ''))) {
                // \section{Title}
                if (node.args.length > 0) {
                    // Avoid \section alone
                    const captionArg = node.args.find(latexParser.isGroup)
                    if (captionArg) {
                        sections.push(new Section(
                            node.name.endsWith('*') ? SectionKind.NoNumberSection : SectionKind.Section,
                            captionify(captionArg),
                            vscode.TreeItemCollapsibleState.Expanded,
                            this.LaTeXSectionDepths[node.name.replace(/\*$/, '')],
                            node.location.start.line - 1,
                            node.location.end.line - 1,
                            file
                        ))
                    }
                }
            } else if (this.LaTeXCommands.cmds.includes(node.name.replace(/\*$/, ''))) {
                // \notlabel{Show}{ShowAlso}
                // const caption = node.args.map(arg => {
                    // const argContent = latexParser.stringify(arg)
                //     return argContent.slice(1, argContent.length - 1)
                // }).join(', ') // -> Show, ShowAlso
                let caption = ''
                const captionArg = node.args.find(latexParser.isGroup)
                if (captionArg) {
                    caption = latexParser.stringify(captionArg)
                    caption = caption.slice(1, caption.length - 1)
                }
                sections.push(new Section(
                    SectionKind.Label,
                    `#${node.name}: ${caption}`,
                    vscode.TreeItemCollapsibleState.Expanded,
                    -1,
                    node.location.start.line - 1,
                    node.location.end.line - 1,
                    file
                ))
            } else if (subFile) {
                // Check if this command is a subfile one
                sections = [
                    ...sections,
                    ...await this.parseLaTeXSubFileCommand(node, file, subFile, filesBuilt)
                ]
            }
        } else if (latexParser.isLabelCommand(node) && this.LaTeXCommands.cmds.includes(node.name)) {
            // \label{this:is_a-label}
            sections.push(new Section(
                SectionKind.Label,
                `#${node.name}: ${node.label}`, // -> #this:is_a-label
                vscode.TreeItemCollapsibleState.Expanded,
                -1,
                node.location.start.line - 1,
                node.location.end.line - 1,
                file
            ))
        } else if (latexParser.isEnvironment(node) && this.LaTeXCommands.envs.includes(node.name.replace(/\*$/, ''))) {
            // \begin{figure}...\end{figure}
            sections.push(new Section(
                SectionKind.Env,
                // -> Figure: Caption of figure
                `${node.name.charAt(0).toUpperCase() + node.name.slice(1)}: ${findEnvCaption(node)}`,
                vscode.TreeItemCollapsibleState.Expanded,
                -1,
                node.location.start.line - 1,
                node.location.end.line - 1,
                file
            ))
        }
        if (latexParser.hasContentArray(node)) {
            for (const subNode of node.content) {
                sections = [
                    ...sections,
                    ...await this.parseLaTeXNode(subNode, file, subFile, filesBuilt)
                ]
            }
        }
        return sections
    }

    /**
     * This function parses a particular LaTeX AST command to see if it is a
     * sub-file-like one. If so, the flat section array of the sub-file is
     * parsed using {@link buildLaTeXSectionFromFile} and returned.
     *
     * @param node The AST command to be parsed.
     *
     * All other parameters are identical to {@link buildLaTeXSectionFromFile}.
     *
     * @returns A flat array of {@link Section} of this sub-file, or an empty
     * array if the command is not a sub-file-like.
     */
    private async parseLaTeXSubFileCommand(node: latexParser.Command, file: string, subFile: boolean, filesBuilt: Set<string>): Promise<Section[]> {
        const cmdArgs: string[] = []
        node.args.forEach((arg) => {
            if (latexParser.isOptionalArg(arg)) {
                return
            }
            const argString = latexParser.stringify(arg)
            cmdArgs.push(argString.slice(1, argString.length - 1))
        })

        const texDirs = vscode.workspace.getConfiguration('latex-toybox').get('latex.texDirs', []) as string[]

        let candidate: string | undefined
        // \input{sub.tex}
        if (['input', 'InputIfFileExists', 'include', 'SweaveInput',
             'subfile', 'loadglsentries'].includes(node.name.replace(/\*$/, ''))
            && cmdArgs.length > 0) {
            candidate = await findFileInDirs(
                [
                    path.dirname(file),
                    path.dirname(this.extension.manager.rootFile || ''),
                    ...texDirs
                ],
                cmdArgs[0]
            )
        }
        // \import{sections/}{section1.tex}
        if (['import', 'inputfrom', 'includefrom'].includes(node.name.replace(/\*$/, ''))
            && cmdArgs.length > 1) {
            candidate = await findFileInDirs(
                [
                    cmdArgs[0],
                    path.join(path.dirname(this.extension.manager.rootFile || ''), cmdArgs[0])
                ],
                cmdArgs[1]
            )
        }
        // \subimport{01-IntroDir/}{01-Intro.tex}
        if (['subimport', 'subinputfrom', 'subincludefrom'].includes(node.name.replace(/\*$/, ''))
            && cmdArgs.length > 1) {
            candidate = await findFileInDirs(
                [path.dirname(file)],
                path.join(cmdArgs[0], cmdArgs[1])
            )
        }

        return candidate ? this.buildLaTeXSectionFromFile(candidate, subFile, filesBuilt) : []
    }

    getTreeItem(element: Section): vscode.TreeItem {

        const hasChildren = element.children.length > 0
        const treeItem: vscode.TreeItem = new vscode.TreeItem(element.label, hasChildren ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None)

        treeItem.command = {
            command: 'latex-toybox.goto-section',
            title: '',
            arguments: [element.fileName, element.lineNumber]
        }

        treeItem.tooltip = `Line ${element.lineNumber + 1} at ${element.fileName}`

        return treeItem
    }

    getChildren(element?: Section): vscode.ProviderResult<Section[]> {
        if (this.extension.manager.rootFile === undefined) {
            return []
        }
        // if the root doesn't exist, we need
        // to explicitly build the model from disk
        if (!element) {
            return this.build(false)
        }

        return element.children
    }

    getParent(element?: Section): Section | undefined {
        if (this.extension.manager.rootFile === undefined || !element) {
            return undefined
        }
        return element.parent
    }
}
