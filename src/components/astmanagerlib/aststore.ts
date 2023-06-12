import * as vscode from 'vscode'
import { stat } from '../../lib/lwfs/lwfs'
import { toKey } from '../../utils/tokey'
import { Mutex } from '../../lib/await-semaphore'


type AstEntry<Ast> = {
    ast: Promise<Ast | undefined>,
    mtime: number
}

export class AstStore<Ast> {
    // key: toKey(uri)
    private readonly AstMap = new Map<string, AstEntry<Ast>>()
    private readonly mutex = new Mutex()

    aquire() {
        return this.mutex.acquire()
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

    updateAst(argUri: vscode.Uri, document: vscode.TextDocument | undefined, entry: AstEntry<Ast>) {
        const [uri, uriDocument] = document ? [document.uri, document] : [argUri, this.findUriDocument(argUri)]
        if (!uriDocument?.isDirty) {
            const key = toKey(uri)
            this.AstMap.set(key, entry)
            return true
        } else {
            return false
        }
    }

    private findUriDocument(uri: vscode.Uri) {
        return vscode.workspace.textDocuments.find(doc => doc.uri.toString() === uri.toString())
    }

}
