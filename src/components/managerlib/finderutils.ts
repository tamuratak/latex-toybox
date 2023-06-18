import * as vscode from 'vscode'
import * as path from 'path'
import * as utils from '../../utils/utils'

import type { LoggerLocator } from '../../interfaces'
import { readFilePathGracefully } from '../../lib/lwfs/lwfs'

interface IExtension extends
    LoggerLocator { }

export class FinderUtils {
    private readonly extension: IExtension

    constructor(extension: IExtension) {
        this.extension = extension
    }

    async findRootFromMagic(): Promise<string | undefined> {
        if (!vscode.window.activeTextEditor) {
            return undefined
        }
        const regex = /^(?:%\s*!\s*T[Ee]X\sroot\s*=\s*(.*\.(?:tex|[jrsRS]nw|[rR]tex|jtexw))$)/m
        let content: string | undefined = vscode.window.activeTextEditor.document.getText()

        let result = content.match(regex)
        const fileStack: string[] = []
        if (result) {
            let file = path.resolve(path.dirname(vscode.window.activeTextEditor.document.fileName), result[1])
            content = await readFilePathGracefully(file)
            if (content === undefined) {
                const msg = `Not found root file specified in the magic comment: ${file}`
                this.extension.logger.info(msg)
                throw new Error(msg)
            }
            fileStack.push(file)
            this.extension.logger.info(`Found root file by magic comment: ${file}`)

            result = content.match(regex)
            while (result) {
                file = path.resolve(path.dirname(file), result[1])
                if (fileStack.includes(file)) {
                    this.extension.logger.info(`Looped root file by magic comment found: ${file}, stop here.`)
                    return file
                } else {
                    fileStack.push(file)
                    this.extension.logger.info(`Recursively found root file by magic comment: ${file}`)
                }

                content = await readFilePathGracefully(file)
                if (content === undefined) {
                    const msg = `Not found root file specified in the magic comment: ${file}`
                    this.extension.logger.info(msg)
                    throw new Error(msg)

                }
                result = content.match(regex)
            }
            return file
        }
        return undefined
    }

    /**
     * Find the mainfile by searching for \documentclass[mainfile]{subfiles} in the content, and return its full path.
     * @param content The content of the subfile.
     * @returns The full path of main file, or undefined if not found.
     */
    async findMainFileFromDocumentClassSubFiles(content: string) {
        if (!vscode.window.activeTextEditor) {
            return undefined
        }
        const regex = /(?:\\documentclass\[(.*)\]{subfiles})/
        const result = content.match(regex)
        if (result) {
            const file = await utils.resolveFile([path.dirname(vscode.window.activeTextEditor.document.fileName)], result[1])
            if (file) {
                this.extension.logger.info(`Found root file of this subfile from active editor: ${file}`)
            } else {
                this.extension.logger.info(`Cannot find root file of this subfile from active editor: ${result[1]}`)
            }
            return file
        }
        return undefined
    }

}
