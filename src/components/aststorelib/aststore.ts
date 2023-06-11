import * as vscode from 'vscode'
import { stat } from '../../lib/lwfs/lwfs'
import { toKey } from '../../utils/tokey'
import { Mutex } from '../../lib/await-semaphore'

type AstEntry<Ast> = {
    ast: Promise<Ast | undefined>,
    mtime: number
}

export interface DoParse<Ast> {
    doParse(uri: vscode.Uri, uriDocument: vscode.TextDocument | undefined): Promise<Ast | undefined>
}

export class AstStore<Ast> {
    // key: toKey(uri)
    private readonly AstMap = new Map<string, AstEntry<Ast>>()
    private readonly doParse: DoParse<Ast>
    private readonly mutex = new Mutex()

    constructor(doParse: DoParse<Ast>) {
        this.doParse = doParse
    }

    aquire() {
        return this.mutex.acquire()
    }

    async getDocAst(document: vscode.TextDocument) {
        return this.getAst(document.uri, document)
    }

    async getAst(argUri: vscode.Uri, document?: vscode.TextDocument) {
        const [uri, uriDocument] = document ? [document.uri, document] : [argUri, this.findUriDocument(argUri)]
        const source = await stat(uri)
        const key = toKey(uri)
        const entry = this.AstMap.get(key)
        if (entry) {
            if (entry.mtime >= source.mtime && !uriDocument?.isDirty) {
                return entry
            } else {
                this.AstMap.delete(key)
            }
        }
        return
    }

    async updateDocAst(document: vscode.TextDocument) {
        return this.updateAst(document.uri, document)
    }

    async updateAst(argUri: vscode.Uri, document?: vscode.TextDocument) {
        const [uri, uriDocument] = document ? [document.uri, document] : [argUri, this.findUriDocument(argUri)]
        if (!uriDocument?.isDirty) {
            const mtime = Date.now()
            const ast = this.doParse.doParse(uri, uriDocument)
            const key = toKey(uri)
            this.AstMap.set(key, { ast, mtime })
            return ast
        }
        return
    }

    private findUriDocument(uri: vscode.Uri) {
        return vscode.workspace.textDocuments.find(doc => doc.uri.toString() === uri.toString())
    }

}
