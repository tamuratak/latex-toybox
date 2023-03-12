import { latexParser } from 'latex-utensils'
import * as vscode from 'vscode'
import type { UtensilsParserLocator } from '../interfaces'
import { toLuPos, convertOffsetToPosition, toVscodePosition } from '../utils/utensils'


interface IExtension extends
    UtensilsParserLocator { }

export class EnvPair {
    private readonly extension: IExtension

    constructor(extension: IExtension) {
        this.extension = extension
    }

    /**
     * On a 'begin' or 'end' keyword, moves the cursor to the corresponding 'end/begin'
     */
    async gotoPair() {
        const editor = vscode.window.activeTextEditor
        if (!editor || editor.document.languageId !== 'latex') {
            return
        }
        const cursor = editor.selection.active
        const commandRange = editor.document.getWordRangeAtPosition(cursor, /\\(?:begin|end)\{[^}]*\}/)
        if (!commandRange) {
            return
        }
        const command = editor.document.getText(commandRange)
        const beginOrEnd = /\\begin/.exec(command) ? 'begin' : 'end'
        const cursorPos = beginOrEnd === 'begin' ? commandRange.end : commandRange.start
        const content = editor.document.getText()
        const ast = await this.extension.utensilsParser.parseLatex(content)
        if (!ast) {
            return
        }
        const envNode = latexParser.findNodeAt(ast.content, toLuPos(cursorPos))
        const newLoc = beginOrEnd === 'begin' ? envNode?.node.location?.end : envNode?.node.location?.start
        if (!newLoc) {
            return
        }
        const newPos = toVscodePosition(newLoc)
        editor.selection = new vscode.Selection(newPos, newPos)
        editor.revealRange(new vscode.Range(newPos, newPos))
    }

    private getEnvNode(
        ast: latexParser.LatexAst,
        cursor: vscode.Position
    ): latexParser.Environment | latexParser.MathEnv | latexParser.MathEnvAligned | undefined {
        let result = latexParser.findNodeAt(ast.content, toLuPos(cursor))
        while (true) {
            if (!result) {
                return
            }
            const node = result.node
            if (latexParser.isEnvironment(node) || latexParser.isMathEnv(node) || latexParser.isMathEnvAligned(node)) {
                return node
            }
            result = result.parent
        }
    }

    /**
     * Select an environment name.
     */
    async envNameAction() {
        const editor = vscode.window.activeTextEditor
        if (!editor || editor.document.languageId !== 'latex') {
            return
        }
        const content = editor.document.getText()
        const ast = await this.extension.utensilsParser.parseLatex(content)
        if (!ast) {
            return
        }
        const cursor = editor.selection.active
        const envNode = this.getEnvNode(ast, cursor)
        if (!envNode) {
            return
        }
        const beginEnvPosA = convertOffsetToPosition(envNode.location.start.offset + '\\begin{'.length, content)
        const beginEnvPosB = convertOffsetToPosition(envNode.location.start.offset + '\\begin{'.length + envNode.name.length, content)
        const endEnvPosA = convertOffsetToPosition(envNode.location.end.offset - envNode.name.length - '}'.length, content)
        const endEnvPosB = convertOffsetToPosition(envNode.location.end.offset - '}'.length, content)
        editor.selections = [new vscode.Selection(beginEnvPosA, beginEnvPosB), new vscode.Selection(endEnvPosA, endEnvPosB)]
    }

}
