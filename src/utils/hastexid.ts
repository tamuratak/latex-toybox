import * as vscode from 'vscode'
import * as path from 'path'


/**
 * Returns `true` if the language of `id` is one of supported languages.
 *
 * @param id The language identifier
 */
export function hasTexId(id: string) {
    return ['tex', 'latex', 'latex-expl3', 'doctex', 'jlweave', 'rsweave'].includes(id)
}

/**
 * Returns `true` if the language of `id` is bibtex
 *
 * @param id The language identifier
*/
export function hasBibtexId(id: string) {
    return id === 'bibtex'
}

const rsweaveExt = ['.rnw', '.Rnw', '.rtex', '.Rtex', '.snw', '.Snw']
const jlweaveExt = ['.jnw', '.jtexw']
const weaveExt = jlweaveExt.concat(rsweaveExt)

export function inferLanguageId(filename: string): string | undefined {
    const ext = path.extname(filename).toLocaleLowerCase()
    if (ext === '.tex') {
        return 'latex'
    } else if (jlweaveExt.includes(ext)) {
        return 'jlweave'
    } else if (rsweaveExt.includes(ext)) {
        return 'rsweave'
    } else if (ext === '.dtx') {
        return 'doctex'
    } else {
        return undefined
    }
}

export function isTexOrWeaveFile(fileUri: vscode.Uri) {
    return ['.tex', ...weaveExt].find(suffix => fileUri.path.toLocaleLowerCase().endsWith(suffix))
}
