import * as vscode from 'vscode'

import {Section, SectionNodeProvider} from './structure'
import type {LoggerLocator, ManagerLocator, UtensilsParserLocator} from '../interfaces'
import { isVirtualUri } from '../lib/lwfs/lwfs'

interface IExtension extends
    LoggerLocator,
    ManagerLocator,
    UtensilsParserLocator { }

export class DocSymbolProvider implements vscode.DocumentSymbolProvider {
    private readonly sectionNodeProvider: SectionNodeProvider

    constructor(extension: IExtension) {
        this.sectionNodeProvider = new SectionNodeProvider(extension)
    }

    async provideDocumentSymbols(document: vscode.TextDocument): Promise<vscode.DocumentSymbol[]> {
        if (document.languageId === 'bibtex') {
            return this.sectionNodeProvider.buildBibTeXModel(document).then((sections: Section[]) => this.sectionToSymbols(sections))
        }
        if (isVirtualUri(document.uri)) {
            return []
        }
        return this.sectionToSymbols(await this.sectionNodeProvider.buildLaTeXModel(document.fileName, false))
    }

    private sectionToSymbols(sections: Section[]): vscode.DocumentSymbol[] {
        const symbols: vscode.DocumentSymbol[] = []

        sections.forEach(section => {
            const range = new vscode.Range(section.lineNumber, 0, section.toLine, 65535)
            const symbol = new vscode.DocumentSymbol(
                section.label || 'empty', '',
                section.depth < 0 ? vscode.SymbolKind.Method : vscode.SymbolKind.Module,
                range, range)
            symbols.push(symbol)
            if (section.children.length > 0) {
                symbol.children = this.sectionToSymbols(section.children)
            }
        })

        return symbols
    }

}
