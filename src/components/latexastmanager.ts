import * as vscode from 'vscode'
import type { UtensilsParserLocator } from '../interfaces'
import { readFile } from '../lib/lwfs/lwfs'
import type { LatexAst } from '../utils/utensils'
import { AstManagerBase } from './astmanagerlib/astmanagerbase'


interface IExtension extends
    UtensilsParserLocator { }

export class LatexAstManager extends AstManagerBase<LatexAst> {
    private readonly extension: IExtension

    constructor(extension: IExtension) {
        super()
        this.extension = extension
    }

    async doParse(uri: vscode.Uri, uriDocument: vscode.TextDocument | undefined) {
        const content = uriDocument ? uriDocument.getText() : await readFile(uri)
        const ast = await this.extension.utensilsParser.parseLatex(content, {enableMathCharacterLocation: true})
        return ast
    }

}
