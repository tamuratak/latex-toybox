import * as vscode from 'vscode'
import type { IAstManager, UtensilsParserLocator } from '../interfaces'
import { readFile } from '../lib/lwfs/lwfs'
import type { LatexAst, BibtexAst } from '../utils/utensils'
import { AstStore } from './astmanagerlib/aststore'


/**
 * The getAst and getDocAst methods call the doParse method if the cache is
 * not found. The methods are locked by a mutex, which prevents
 * multiple calls to doParse for the same file at the same time. The AST is
 * cached as a Promise<AST>, and the methods immediately return this promise.
 * At this point, the execution of parsing is delayed.
 */
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
                // By returning without await, the execution of parsing is delayed.
                // eslint-disable-next-line @typescript-eslint/return-await
                return entry.ast
            } else {
                const mtime = Date.now()
                const ast = this.doParse(uri, document)
                this.astStore.updateAst(uri, document, { ast, mtime })
                // By returning without await, the execution of parsing is delayed.
                // eslint-disable-next-line @typescript-eslint/return-await
                return ast
            }
        } finally {
            release()
        }
    }

    abstract doParse(uri: vscode.Uri, uriDocument: vscode.TextDocument | undefined): Promise<Ast | undefined>

}

interface IExtension extends
    UtensilsParserLocator { }

export class LatexAstManager extends AstManagerBase<LatexAst> {
    private readonly extension: IExtension

    constructor(extension: IExtension) {
        super()
        this.extension = extension
    }

    async doParse(uri: vscode.Uri, uriDocument: vscode.TextDocument | undefined) {
        const content = uriDocument ? uriDocument.getText() : await readFile(uri)
        const ast = await this.extension.utensilsParser.parseLatex(content, {enableMathCharacterLocation: true})
        return ast
    }

}

export class BibtexAstManager extends AstManagerBase<BibtexAst> {
    private readonly extension: IExtension

    constructor(extension: IExtension) {
        super()
        this.extension = extension
    }

    async doParse(uri: vscode.Uri, uriDocument: vscode.TextDocument | undefined) {
        const content = uriDocument ? uriDocument.getText() : await readFile(uri)
        const ast = await this.extension.utensilsParser.parseBibtex(content)
        return ast
    }

}
