import * as vscode from 'vscode'
import { IAstManager } from '../../interfaces'
import { AstStore } from './aststore'


export abstract class AstManagerBase<Ast> implements IAstManager<Ast> {
    private readonly astStore: AstStore<Ast>

    constructor() {
        this.astStore = new AstStore<Ast>()
    }

    async getDocAst(document: vscode.TextDocument) {
        return this.getAstInternal(document.uri, document)
    }

    async getAst(uri: vscode.Uri): Promise<Ast | undefined> {
        return this.getAstInternal(uri, undefined)
    }

    private async getAstInternal(uri: vscode.Uri, document: vscode.TextDocument | undefined): Promise<Ast | undefined> {
        const release = await this.astStore.aquire()
        try {
            const entry = await this.astStore.getAst(uri, document)
            if (entry) {
                // eslint-disable-next-line @typescript-eslint/return-await
                return entry.ast
            } else {
                const mtime = Date.now()
                const ast = this.doParse(uri, document)
                this.astStore.updateAst(uri, document, { ast, mtime })
                // eslint-disable-next-line @typescript-eslint/return-await
                return ast
            }
        } finally {
            release()
        }
    }

    abstract doParse(uri: vscode.Uri, uriDocument: vscode.TextDocument | undefined): Promise<Ast | undefined>

}
