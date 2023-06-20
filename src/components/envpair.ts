import { latexParser } from 'latex-utensils'
import * as vscode from 'vscode'
import { toLuPos, toVscodePosition } from '../utils/utensils'
import type { LatexAstManager } from './astmanager'


export class EnvPair {

    constructor(private readonly extension: {
        readonly latexAstManager: LatexAstManager
    }) { }

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
        const ast = await this.extension.latexAstManager.getDocAst(editor.document)
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

}
