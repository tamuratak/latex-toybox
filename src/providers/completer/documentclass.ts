import * as vscode from 'vscode'

import type {IProvider} from './interface'
import { readFilePath } from '../../lib/lwfs/lwfs'
import { ExternalPromise } from '../../utils/externalpromise'


type DataClassnamesJsonType = typeof import('../../../data/classnames.json')

type ClassItemEntry = {
    readonly command: string,
    readonly detail: string,
    readonly documentation: string
}

export class DocumentClass implements IProvider {
    private readonly suggestions: vscode.CompletionItem[] = []
    readonly #readyPromise = new ExternalPromise<void>()

    constructor(private readonly extension: {
        readonly extensionRoot: string
    }) {
        void this.load().then(() => this.#readyPromise.resolve())
    }

    get readyPromise() {
        return this.#readyPromise.promise
    }

    private async load() {
        const content = await readFilePath(`${this.extension.extensionRoot}/data/classnames.json`)
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
