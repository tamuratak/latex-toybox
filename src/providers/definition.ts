import * as vscode from 'vscode'
import * as path from 'path'

import {tokenizer} from '../utils/tokenizer'
import * as utils from '../utils/utils'
import { existsPath, isVirtualUri } from '../lib/lwfs/lwfs'
import type { Manager } from '../components/manager'
import type { Completer } from './completion'

export class DefinitionProvider implements vscode.DefinitionProvider {

    constructor(private readonly extension: {
        readonly completer: Completer,
        readonly manager: Manager
    }) { }

    private onAFilename(document: vscode.TextDocument, position: vscode.Position, token: string) {
        const line = document.lineAt(position).text
        const escapedToken = utils.escapeRegExp(token)
        const regexInput = new RegExp(`\\\\(?:include|input|subfile)\\{${escapedToken}\\}`)
        const regexImport = new RegExp(`\\\\(?:sub)?(?:import|includefrom|inputfrom)\\*?\\{([^\\}]*)\\}\\{${escapedToken}\\}`)
        const regexDocumentclass = new RegExp(`\\\\(?:documentclass)(?:\\[[^[]]*\\])?\\{${escapedToken}\\}`)

        if (! vscode.window.activeTextEditor) {
            return undefined
        }

        if (line.match(regexDocumentclass)) {
            return utils.findFileInDirs([path.dirname(vscode.window.activeTextEditor.document.fileName)], token, '.cls')
        }

        let dirs: string[] = []
        if (line.match(regexInput)) {
            dirs = [path.dirname(vscode.window.activeTextEditor.document.fileName)]
            if (this.extension.manager.rootDir !== undefined) {
                dirs.push(this.extension.manager.rootDir)
            }
        }

        const result = line.match(regexImport)
        if (result) {
            dirs = [path.resolve(path.dirname(vscode.window.activeTextEditor.document.fileName), result[1])]
        }

        if (dirs.length > 0) {
            return utils.findFileInDirs(dirs, token, '.tex')
        }
        return undefined
    }

    async provideDefinition(document: vscode.TextDocument, position: vscode.Position) {
        if (isVirtualUri(document.uri)) {
            return
        }
        const token = tokenizer(document, position)
        if (token === undefined) {
            return
        }

        if (token.startsWith('\\')) {
            const command = this.extension.completer.command.definedCmds.get(token.slice(1))
            if (command) {
                return command.location
            }
            return undefined
        }
        const ref = this.extension.completer.reference.getLabelDef(token)
        if (ref) {
            return new vscode.Location(vscode.Uri.file(ref.file), ref.position)
        }
        const cite = this.extension.completer.citation.getEntry(token)
        if (cite) {
            return new vscode.Location(vscode.Uri.file(cite.file), cite.position)
        }
        const glossary = this.extension.completer.glossary.getEntry(token)
        if (glossary) {
            return new vscode.Location(vscode.Uri.file(glossary.file), glossary.position)
        }
        if (vscode.window.activeTextEditor && token.includes('.')) {
            // We skip graphics files
            const graphicsExtensions = ['.pdf', '.eps', '.jpg', '.jpeg', '.JPG', '.JPEG', '.gif', '.png']
            const ext = path.extname(token)
            if (graphicsExtensions.includes(ext)) {
                return
            }
            const absolutePath = path.resolve(path.dirname(vscode.window.activeTextEditor.document.fileName), token)
            if (await existsPath(absolutePath)) {
                return new vscode.Location( vscode.Uri.file(absolutePath), new vscode.Position(0, 0) )
            }
        }

        const filename = await this.onAFilename(document, position, token)
        if (filename) {
            return new vscode.Location( vscode.Uri.file(filename), new vscode.Position(0, 0) )
        }
        return
    }

}
