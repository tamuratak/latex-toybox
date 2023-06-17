import * as vscode from 'vscode'
import * as os from 'os'
import * as micromatch from 'micromatch'


export function findWorkspace(): vscode.Uri | undefined {
    const firstDir = vscode.workspace.workspaceFolders?.[0]
    // If no workspace is opened.
    if (!firstDir) {
        return undefined
    }
    // If we don't have an active text editor, we can only make a guess.
    // Let's guess the first one.
    if (!vscode.window.activeTextEditor) {
        return firstDir.uri
    }
    // Get the workspace folder which contains the active document.
    const activeFileUri = vscode.window.activeTextEditor.document.uri
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(activeFileUri)
    if (workspaceFolder) {
        return workspaceFolder.uri
    }
    // Guess that the first workspace is the chosen one.
    return firstDir.uri
}

export function isExcluded(file: string): boolean {
    const globsToIgnore = vscode.workspace.getConfiguration('latex-workshop').get('latex.watch.files.ignore') as string[]
    const format = (str: string): string => {
        if (os.platform() === 'win32') {
            return str.replace(/\\/g, '/')
        }
        return str
    }
    return micromatch.some(file, globsToIgnore, { format })
}
