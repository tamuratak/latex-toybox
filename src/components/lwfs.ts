import * as vscode from 'vscode'
import * as fs from 'fs'
import type {ILwFileSystem, LoggerLocator} from '../interfaces'

interface IExtension extends LoggerLocator { }

export class LwFileSystem implements ILwFileSystem {
    private readonly extension: IExtension

    constructor(extension: IExtension) {
        this.extension = extension
    }

    isLocalUri(uri: vscode.Uri): boolean {
        return uri.scheme === 'file'
    }

    isVirtualUri(uri: vscode.Uri): boolean {
        return !this.isLocalUri(uri)
    }

    async exists(uri: vscode.Uri): Promise<boolean> {
        try {
            if (this.isLocalUri(uri)) {
                await fs.promises.stat(uri.fsPath)
                return true
            } else {
                await vscode.workspace.fs.stat(uri)
                return true
            }
        } catch {
            return false
        }
    }

    async readFilePath(filePath: string): Promise<string> {
        return this.readFile(vscode.Uri.file(filePath))
    }

    async readFilePathGracefully(filepath: string): Promise<string | undefined> {
        try {
            return await this.readFilePath(filepath)
        } catch (err) {
            if (err instanceof Error) {
                this.extension.logger.logError(err)
            }
            return undefined
        }
    }

    async readFile(fileUri: vscode.Uri): Promise<string> {
        const result = await this.readFileAsBuffer(fileUri)
        return result.toString()
    }

    async readFileGracefully(fileUri: vscode.Uri): Promise<string | undefined> {
        try {
            return await this.readFile(fileUri)
        } catch (err) {
            if (err instanceof Error) {
                this.extension.logger.logError(err)
            }
            return undefined
        }
    }

    async readFileAsBuffer(fileUri: vscode.Uri): Promise<Buffer> {
        if (this.isLocalUri(fileUri)) {
            return fs.promises.readFile(fileUri.fsPath)
        } else {
            const resultUint8 = await vscode.workspace.fs.readFile(fileUri)
            return Buffer.from(resultUint8)
        }
    }

    async stat(fileUri: vscode.Uri): Promise<fs.Stats | vscode.FileStat> {
        if (this.isLocalUri(fileUri)) {
            return fs.statSync(fileUri.fsPath)
        } else {
            return vscode.workspace.fs.stat(fileUri)
        }
    }

}
