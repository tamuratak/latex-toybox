import { latexParser } from 'latex-utensils'
import * as vscode from 'vscode'
import type { Extension } from '../main'
import { MutexWithSizedQueue } from '../utils/mutexwithsizedqueue'
import { toVscodeRange } from '../utils/utensils'


export class ReferenceUpdater {
    private readonly extension: Extension
    private readonly mutex = new MutexWithSizedQueue(1)

    constructor(extension: Extension) {
        this.extension = extension
        this.extension.eventBus.onDidChangeRootFile(() => {
            void this.update()
        })
        vscode.workspace.onDidChangeTextDocument(() => {
            void this.update()
        })
    }

    private get labelCommandLocationMap() {
        return this.extension.referenceStore.labelCommandLocationMap
    }

    private get refCommandLocationMap() {
        return this.extension.referenceStore.refCommandLocationMap
    }

    private get citeCommandLocationMap() {
        return this.extension.referenceStore.citeCommandLocationMap
    }

    private get bibitemCommandLocationMap() {
        return this.extension.referenceStore.bibitemCommandLocationMap
    }

    private clear() {
        this.extension.referenceStore.clear()
    }

    private findRefLabelCommand(ast: latexParser.LatexAst, filePath: string) {
        latexParser.findAll(ast.content, latexParser.isLabelCommand).forEach(result => {
            const node = result.node
            const location = {
                start: {
                    line: node.location.start.line,
                    column: node.location.start.column + node.name.length + 2, // for the length of \cmdname{
                },
                end: {
                    line: node.location.end.line,
                    column: node.location.end.column - 1 // for the last }
                }
            }
            const range = toVscodeRange(location)
            const storedMap = node.name === 'label' ? this.labelCommandLocationMap : this.refCommandLocationMap
            const array = storedMap.get(node.label)
            if (array) {
                array.push(new vscode.Location(vscode.Uri.file(filePath), range))
            } else {
                storedMap.set(node.label, [new vscode.Location(vscode.Uri.file(filePath), range)])
            }
        })
    }

    private findCiteBibitemCommand(ast: latexParser.LatexAst, filePath: string) {
        latexParser.findAll(ast.content, latexParser.isCommand).forEach(result => {
            const node = result.node
            if (node.name !== 'cite' && node.name !== 'bibitem') {
                return
            }
            const location = {
                start: {
                    line: node.location.start.line,
                    column: node.location.start.column + node.name.length + 2, // for the length of \cite{
                },
                end: {
                    line: node.location.end.line,
                    column: node.location.end.column - 1 // for the last }
                }
            }
            const range = toVscodeRange(location)
            const arg = node.args.find(latexParser.isGroup)
            if (arg === undefined) {
                return
            }
            const key = latexParser.stringify(arg.content)
            const storedMap = node.name === 'bibitem' ? this.bibitemCommandLocationMap : this.citeCommandLocationMap
            const array = storedMap.get(key)
            if (array) {
                array.push(new vscode.Location(vscode.Uri.file(filePath), range))
            } else {
                storedMap.set(key, [new vscode.Location(vscode.Uri.file(filePath), range)])
            }
        })
    }

    private async updateForFile(filePath: string) {
        const doc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === filePath)
        const content = doc?.getText() || await this.extension.lwfs.readFile(vscode.Uri.file(filePath))
        if (content === undefined) {
            return
        }
        const ast = await this.extension.pegParser.parseLatex(content)
        if (!ast) {
            return
        }
        this.findRefLabelCommand(ast, filePath)
        this.findCiteBibitemCommand(ast, filePath)
        const children = this.extension.manager.getCachedContent(filePath)?.children ?? []
        for (const child of children) {
            await this.updateForFile(child.file)
        }
    }

    private async update() {
        let release: (() => void) | undefined
        try {
            release = await this.mutex.acquire()
            this.clear()
            const rootFile = this.extension.manager.rootFile
            if (!rootFile) {
                return
            }
            await this.updateForFile(rootFile)
        } finally {
            release?.()
        }
    }

}

export class ReferenceProvider implements vscode.ReferenceProvider {
    private readonly extension: Extension

    constructor(extension: Extension) {
        this.extension = extension
        new ReferenceUpdater(extension)
    }

    private get labelCommandLocationMap() {
        return this.extension.referenceStore.labelCommandLocationMap
    }

    private get refCommandLocationMap() {
        return this.extension.referenceStore.refCommandLocationMap
    }

    private get citeCommandLocationMap() {
        return this.extension.referenceStore.citeCommandLocationMap
    }

    private get bibitemCommandLocationMap() {
        return this.extension.referenceStore.bibitemCommandLocationMap
    }

    provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.ReferenceContext,
    ) {
        const result = this.provideForRefCommand(document, position, context)
                    || this.provideForCiteCommand(document, position, context)
                    || []
        return result
    }

    private provideForRefCommand(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.ReferenceContext,
    ) {
        const regex = /\\(?:label|eqref|ref|autoref)\{([^}]*)\}/
        const range = document.getWordRangeAtPosition(position, regex)
        if (range) {
            const result: vscode.Location[] = []
            const labelName = document.getText(range).replace(regex, '$1')
            const refs = this.refCommandLocationMap.get(labelName)
            if (refs) {
                result.push(...refs)
            }
            if (context.includeDeclaration) {
                const definitions = this.labelCommandLocationMap.get(labelName)
                if (definitions) {
                    result.push(...definitions)
                }
            }
            return result
        }
        return
    }

    private provideForCiteCommand(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.ReferenceContext,
    ): vscode.Location[] | undefined {
        const regex = /\\(?:cite)\{([^}]*)\}/
        const range = document.getWordRangeAtPosition(position, regex)
        if (range) {
            const result: vscode.Location[] = []
            const key = document.getText(range).replace(regex, '$1')
            const cites = this.citeCommandLocationMap.get(key)
            if (cites) {
                result.push(...cites)
            }
            if (context.includeDeclaration) {
                const definitions = this.bibitemCommandLocationMap.get(key) || []
                definitions.push(...this.provideCiteDefinition(key))
                result.push(...definitions)
            }
            return result
        }
        return
    }

    private provideCiteDefinition(key: string) {
        const definition = this.extension.completer.citation.getEntry(key)
        if (definition) {
            return [new vscode.Location(vscode.Uri.file(definition.file), definition.position)]
        }
        return []
    }

}
