import * as vscode from 'vscode'

import type {IProvider} from './interface'
import type {ExtensionRootLocator, LwfsLocator} from '../../interfaces'

type DataClassnamesJsonType = typeof import('../../../data/classnames.json')

type ClassItemEntry = {
    readonly command: string,
    readonly detail: string,
    readonly documentation: string
}

interface IExtension extends
    ExtensionRootLocator,
    LwfsLocator { }

export class DocumentClass implements IProvider {
    private readonly extension: IExtension
    private readonly suggestions: vscode.CompletionItem[] = []

    constructor(extension: IExtension) {
        this.extension = extension
        void this.load()
    }

    private async load() {
        const content = await this.extension.lwfs.readFile(vscode.Uri.file(`${this.extension.extensionRoot}/data/classnames.json`))
        const allClasses: {[key: string]: ClassItemEntry} = JSON.parse(content) as DataClassnamesJsonType
        this.initialize(allClasses)
    }

    private initialize(classes: {[key: string]: ClassItemEntry}) {
        Object.keys(classes).forEach(key => {
            const item = classes[key]
            const cl = new vscode.CompletionItem(item.command, vscode.CompletionItemKind.Module)
            cl.detail = item.detail
            cl.documentation = new vscode.MarkdownString(`[${item.documentation}](${item.documentation})`)
            this.suggestions.push(cl)
        })
    }

    provideFrom() {
        return this.provide()
    }

    private provide(): vscode.CompletionItem[] {
        return this.suggestions
    }
}
