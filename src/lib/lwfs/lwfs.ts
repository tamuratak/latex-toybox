import * as vscode from 'vscode'
import * as fs from 'fs'
import { hasTexId } from '../../utils/hastexid'


export function isLocalUri(uri: vscode.Uri): boolean {
    return uri.scheme === 'file'
}

export function isLocalLatexDocument(document: vscode.TextDocument) {
    return isLocalUri(document.uri) && hasTexId(document.languageId)
}

export function isVirtualUri(uri: vscode.Uri): boolean {
    return !isLocalUri(uri)
}

export async function exists(uri: vscode.Uri): Promise<boolean> {
    try {
        await stat(uri)
        return true
    } catch {
        return false
    }
}

export async function existsPath(filePath: string): Promise<boolean> {
    return exists(vscode.Uri.file(filePath))
}

export async function readFilePath(filePath: string): Promise<string> {
    return readFile(vscode.Uri.file(filePath))
}

export async function readFilePathGracefully(filepath: string): Promise<string | undefined> {
    try {
        return await readFilePath(filepath)
    } catch (err) {
        return undefined
    }
}

export async function readFile(fileUri: vscode.Uri): Promise<string> {
    const result = await readFileAsBuffer(fileUri)
    return result.toString()
}

export async function readFileGracefully(fileUri: vscode.Uri): Promise<string | undefined> {
    try {
        return await readFile(fileUri)
    } catch (err) {
        return undefined
    }
}

export async function readFileAsBuffer(fileUri: vscode.Uri): Promise<Buffer> {
    if (isLocalUri(fileUri)) {
        return fs.promises.readFile(fileUri.fsPath)
    } else {
        const resultUint8 = await vscode.workspace.fs.readFile(fileUri)
        return Buffer.from(resultUint8)
    }
}

export async function stat(fileUri: vscode.Uri): Promise<vscode.FileStat> {
    if (isLocalUri(fileUri)) {
        const st = await fs.promises.stat(fileUri.fsPath)
        return {
            type: st.isFile() ? vscode.FileType.File : st.isDirectory() ? vscode.FileType.Directory : st.isSymbolicLink() ? vscode.FileType.SymbolicLink : vscode.FileType.Unknown,
            ctime: st.ctimeMs,
            mtime: st.mtimeMs,
            size: st.size
        }

    } else {
        return vscode.workspace.fs.stat(fileUri)
    }
}

export async function statPath(filePath: string): Promise<vscode.FileStat> {
    return stat(vscode.Uri.file(filePath))
}

export async function readDir(fileUri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    if (isLocalUri(fileUri)) {
        const result = await fs.promises.readdir(fileUri.fsPath, { withFileTypes: true })
        const fileType = (entry: fs.Dirent) => entry.isFile() ? vscode.FileType.File : entry.isDirectory() ? vscode.FileType.Directory : entry.isSymbolicLink() ? vscode.FileType.SymbolicLink : vscode.FileType.Unknown
        return result.map(entry => [entry.name, fileType(entry)])
    } else {
        return vscode.workspace.fs.readDirectory(fileUri)
    }
}
