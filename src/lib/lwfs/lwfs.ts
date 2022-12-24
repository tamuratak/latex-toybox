import * as vscode from 'vscode'
import * as fs from 'fs'


export function isLocalUri(uri: vscode.Uri): boolean {
    return uri.scheme === 'file'
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

export async function stat(fileUri: vscode.Uri): Promise<fs.Stats | vscode.FileStat> {
    if (isLocalUri(fileUri)) {
        return fs.promises.stat(fileUri.fsPath)
    } else {
        return vscode.workspace.fs.stat(fileUri)
    }
}
