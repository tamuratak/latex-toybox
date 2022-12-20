import * as vscode from 'vscode'

import type {IProvider} from './interface'
import type {ExtensionRootLocator, LwfsLocator} from '../../interfaces'

type DataPackagesJsonType = typeof import('../../../data/packagenames.json')

type PackageItemEntry = {
    readonly command: string,
    readonly detail: string,
    readonly documentation: string
}

interface IExtension extends
    ExtensionRootLocator,
    LwfsLocator { }

export class Package implements IProvider {
    private readonly extension: IExtension
    private readonly suggestions: vscode.CompletionItem[] = []

    constructor(extension: IExtension) {
        this.extension = extension
        void this.load()
    }

    private async load() {
        const content = await this.extension.lwfs.readFile(vscode.Uri.file(`${this.extension.extensionRoot}/data/packagenames.json`))
        const pkgs: {[key: string]: PackageItemEntry} = JSON.parse(content) as DataPackagesJsonType
        this.initialize(pkgs)
    }

    private initialize(defaultPackages: {[key: string]: PackageItemEntry}) {
        Object.keys(defaultPackages).forEach(key => {
            const item = defaultPackages[key]
            const pack = new vscode.CompletionItem(item.command, vscode.CompletionItemKind.Module)
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
