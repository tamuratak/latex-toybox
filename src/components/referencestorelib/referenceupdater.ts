import { latexParser } from 'latex-utensils'
import * as vscode from 'vscode'
import type { LatexAstManagerLocator, EventBusLocator, ExtensionContextLocator, ManagerLocator, ReferenceStoreLocator } from '../../interfaces'
import { MutexWithSizedQueue } from '../../utils/mutexwithsizedqueue'
import { toVscodeRange } from '../../utils/utensils'


interface IExtension extends
    ExtensionContextLocator,
    EventBusLocator,
    ManagerLocator,
    LatexAstManagerLocator,
    ReferenceStoreLocator { }

export class ReferenceUpdater {
    private readonly extension: IExtension
    private readonly mutex = new MutexWithSizedQueue(1)

    constructor(extension: IExtension) {
        this.extension = extension
        extension.extensionContext.subscriptions.push(
            this.extension.eventBus.rootFileChanged.event(() => {
                void this.update()
            }),
            vscode.workspace.onDidSaveTextDocument(() => {
                void this.update()
            })
        )
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
        let ast: latexParser.LatexAst | undefined
        if (doc) {
            ast = await this.extension.latexAstManager.getDocAst(doc)
        } else {
            ast = await this.extension.latexAstManager.getAst(vscode.Uri.file(filePath))
        }
        if (!ast) {
            return
        }
        this.findRefLabelCommand(ast, filePath)
        this.findCiteBibitemCommand(ast, filePath)
        const children = this.extension.manager.getCachedContent(filePath)?.children.cache ?? []
        for (const child of children) {
            await this.updateForFile(child)
        }
    }

    async update() {
        await this.mutex.noopIfOccupied(async () => {
            this.clear()
            const rootFile = this.extension.manager.rootFile
            if (!rootFile) {
                return
            }
            await this.updateForFile(rootFile)
        })
    }

}
