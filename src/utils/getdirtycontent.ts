import * as vscode from 'vscode'
import { readFilePathGracefully } from '../lib/lwfs/lwfs'


/**
 * Get the buffer content of a file if it is opened in vscode. Otherwise, read the file from disk
 */
export async function getDirtyContent(file: string) {
    const doc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === file)
    const content = doc?.getText() || await readFilePathGracefully(file)
    return { content, doc }
}
