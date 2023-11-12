import * as vscode from 'vscode'
import { readFilePathGracefully } from '../lib/lwfs/lwfs.js'


/**
 * If the file is currently open in VS Code, get its buffer content. Otherwise, read the file from disk.
 */
export async function getDirtyContent(file: string) {
    const doc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === file)
    const content = doc?.getText() || await readFilePathGracefully(file)
    return { content, doc }
}
