import * as vscode from 'vscode'
import type { IAstManager, UtensilsParserLocator } from '../interfaces'
import { readFile } from '../lib/lwfs/lwfs'
import type { BibtexAst } from '../utils/utensils'
import { AstStore, DoParse } from './aststorelib/aststore'


interface IExtension extends
    UtensilsParserLocator { }

class BibtexDoParse implements DoParse<BibtexAst> {
    private readonly extension: IExtension

    constructor(extension: IExtension) {
        this.extension = extension
    }

    async doParse(uri: vscode.Uri, uriDocument: vscode.TextDocument | undefined) {
        const content = uriDocument ? uriDocument.getText() : await readFile(uri)
        const ast = await this.extension.utensilsParser.parseBibtex(content)
        return ast
    }

}

export class BibtexAstManager implements IAstManager<BibtexAst> {
    private readonly astStore

    constructor(extension: IExtension) {
        this.astStore = new AstStore<BibtexAst>(new BibtexDoParse(extension))
    }

    async getDocAst(document: vscode.TextDocument): Promise<BibtexAst | undefined> {
        const release = await this.astStore.aquire()
        try {
            const entry = await this.astStore.getDocAst(document)
            if (entry) {
                // eslint-disable-next-line @typescript-eslint/return-await
                return entry.ast
            } else {
                // eslint-disable-next-line @typescript-eslint/return-await
                return this.astStore.updateDocAst(document)
            }
        } finally {
            release()
        }
    }

    async getAst(argUri: vscode.Uri): Promise<BibtexAst | undefined> {
        const release = await this.astStore.aquire()
        try {
            const entry = await this.astStore.getAst(argUri)
            if (entry) {
                // eslint-disable-next-line @typescript-eslint/return-await
                return entry.ast
            } else {
                // eslint-disable-next-line @typescript-eslint/return-await
                return this.astStore.updateAst(argUri)
            }
        } finally {
            release()
        }
    }

}
