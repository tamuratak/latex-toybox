import * as vscode from 'vscode'

import type {IProvider} from './interface'
import { readFilePath } from '../../lib/lwfs/lwfs'
import { ExternalPromise } from '../../utils/externalpromise'
import { PackageClassNameKind } from './completionkind'


type DataPackagesJsonType = typeof import('../../../data/packagenames.json')

type PackageItemEntry = {
    readonly command: string,
    readonly detail: string,
    readonly documentation: string
}

export class Package implements IProvider {
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
        const content = await readFilePath(`${this.extension.extensionRoot}/data/packagenames.json`)
        const pkgs: {[key: string]: PackageItemEntry} = JSON.parse(content) as DataPackagesJsonType
        this.initialize(pkgs)
    }

    private initialize(defaultPackages: {[key: string]: PackageItemEntry}) {
        Object.keys(defaultPackages).forEach(key => {
            const item = defaultPackages[key]
            const pack = new vscode.CompletionItem(item.command, PackageClassNameKind)
            pack.detail = item.detail
            pack.documentation = new vscode.MarkdownString(`[${item.documentation}](${item.documentation})`)
            this.suggestions.push(pack)
        })
    }

    provideFrom() {
        return this.provide()
    }

    private provide(): vscode.CompletionItem[] {
        return this.suggestions
    }
}
