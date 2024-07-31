import * as vscode from 'vscode'

import type {IProvider} from './interface.js'
import { readFilePath } from '../../lib/lwfs/lwfs.js'
import { PackageClassNameKind } from './completionkind.js'


type DataClassnamesJsonType = typeof import('../../../data/classnames.json')

interface ClassItemEntry {
    readonly command: string,
    readonly detail: string,
    readonly documentation: string
}

export class DocumentClass implements IProvider {
    private readonly suggestions: vscode.CompletionItem[] = []
    readonly readyPromise: Promise<void>

    constructor(private readonly extension: {
        readonly extensionRoot: string
    }) {
        this.readyPromise = new Promise((resolve) => this.load().then(() => resolve()))
    }

    private async load() {
        const content = await readFilePath(`${this.extension.extensionRoot}/data/classnames.json`)
        const allClasses: Record<string, ClassItemEntry> = JSON.parse(content) as DataClassnamesJsonType
        this.initialize(allClasses)
    }

    private initialize(classes: Record<string, ClassItemEntry>) {
        Object.keys(classes).forEach(key => {
            const item = classes[key]
            const cl = new vscode.CompletionItem(item.command, PackageClassNameKind)
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
