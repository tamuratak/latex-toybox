import * as vscode from 'vscode'

import { MathJaxPool } from './mathpreviewlib/mathjaxpool.js'
import * as utils from '../utils/svg.js'
import type { LabelDefinitionEntry } from '../providers/completionlib/labeldefinition.js'
import { getCurrentThemeLightness } from '../utils/theme.js'

import { CursorRenderer } from './mathpreviewlib/cursorrenderer.js'
import { type ITextDocumentLike, TextDocumentLike } from './mathpreviewlib/textdocumentlike.js'
import { NewCommandFinder } from './mathpreviewlib/newcommandfinder.js'
import { TexMathEnv, TeXMathEnvFinder } from './mathpreviewlib/texmathenvfinder.js'
import { HoverPreviewOnRefProvider } from './mathpreviewlib/hoverpreviewonref.js'
import { MathPreviewUtils } from './mathpreviewlib/mathpreviewutils.js'
import { Logger } from './logger.js'
import { Manager } from './manager.js'
import { UtensilsParser } from './utensilsparser.js'

export type { TexMathEnv } from './mathpreviewlib/texmathenvfinder.js'


export class MathPreview {
    private color = '#000000'
    private readonly mj: MathJaxPool
    private readonly cursorRenderer: CursorRenderer
    private readonly newCommandFinder: NewCommandFinder
    readonly texMathEnvFinder: TeXMathEnvFinder
    private readonly hoverPreviewOnRefProvider: HoverPreviewOnRefProvider
    private readonly mputils: MathPreviewUtils

    constructor(private readonly extension: {
        readonly logger: Logger,
        readonly manager: Manager,
        readonly utensilsParser: UtensilsParser
    }) {
        this.mj = new MathJaxPool()
        vscode.workspace.onDidChangeConfiguration(() => this.getColor())
        this.cursorRenderer = new CursorRenderer(extension)
        this.mputils = new MathPreviewUtils()
        this.newCommandFinder = new NewCommandFinder(extension)
        this.texMathEnvFinder = new TeXMathEnvFinder()
        this.hoverPreviewOnRefProvider = new HoverPreviewOnRefProvider(extension, this.mj, this.mputils)
    }

    dispose() {
        return this.mj.dispose()
    }

    findProjectNewCommand(ctoken: vscode.CancellationToken): Promise<string> {
        return this.newCommandFinder.findProjectNewCommand(ctoken)
    }

    async provideHoverOnTex(document: vscode.TextDocument, tex: TexMathEnv, newCommand: string): Promise<vscode.Hover> {
        const configuration = vscode.workspace.getConfiguration('latex-toybox')
        const scale = configuration.get('hover.preview.scale') as number
        let newTexString = await this.cursorRenderer.renderCursor(document, tex, this.color) || tex.texString
        newTexString = this.mputils.mathjaxify(newTexString, tex.envname)
        const typesetArg = newCommand + this.mputils.stripTeX(newTexString)
        const typesetOpts = { scale, color: this.color }
        try {
            const xml = await this.mj.typeset(typesetArg, typesetOpts)
            const md = utils.svgToDataUrl(xml)
            return new vscode.Hover(new vscode.MarkdownString(this.mputils.addDummyCodeBlock(`![equation](${md})`)), tex.range )
        } catch(e) {
            this.extension.logger.error(`Error while MathJax is rendering: ${typesetArg}`)
            this.extension.logger.logError(e)
            throw e
        }
    }

    async provideHoverOnRef(
        document: vscode.TextDocument,
        position: vscode.Position,
        labelDef: LabelDefinitionEntry,
        token: string,
        ctoken: vscode.CancellationToken
    ): Promise<vscode.Hover> {
        const configuration = vscode.workspace.getConfiguration('latex-toybox')
        const line = labelDef.position.line
        const link = vscode.Uri.parse('command:latex-toybox.synctexto').with({ query: JSON.stringify([line, labelDef.file]) })
        const mdLink = new vscode.MarkdownString(`[View on pdf](${link})`)
        mdLink.isTrusted = true
        try {
            const tex = await this.texMathEnvFinder.findHoverOnRef(document, position, labelDef, token)
            if (tex) {
                const newCommands = await this.findProjectNewCommand(ctoken)
                return await this.hoverPreviewOnRefProvider.provideHoverPreviewOnRef(tex, newCommands, labelDef, this.color)
            }
        } catch (_) {
            // ignore
        }
        const md = '```latex\n' + labelDef.documentation + '\n```\n'
        const refRange = document.getWordRangeAtPosition(position, /\{.*?\}/)
        const refNumberMessage = this.refNumberMessage(labelDef)
        if (refNumberMessage !== undefined && configuration.get('hover.ref.number.enabled') as boolean) {
            return new vscode.Hover([md, refNumberMessage, mdLink], refRange)
        }
        return new vscode.Hover([md, mdLink], refRange)
    }

    private refNumberMessage(labelDef: LabelDefinitionEntry): string | undefined {
        if (labelDef.prevIndex) {
            const refNum = labelDef.prevIndex.refNumber
            const refMessage = `numbered ${refNum} at last compilation`
            return refMessage
        }
        return undefined
    }

    async generateSVG(tex: Pick<TexMathEnv, 'texString' | 'envname'>, newCommandsArg?: string) {
        const newCommands: string = newCommandsArg ?? await this.newCommandFinder.findProjectNewCommand()
        const configuration = vscode.workspace.getConfiguration('latex-toybox')
        const scale = configuration.get('hover.preview.scale') as number
        const newTexString = this.mputils.mathjaxify(tex.texString, tex.envname)
        const xml = await this.mj.typeset(newCommands + this.mputils.stripTeX(newTexString), {scale, color: this.color})
        return {svgDataUrl: utils.svgToDataUrl(xml), newCommands}
    }

    getColor() {
        const lightness = getCurrentThemeLightness()
        if (lightness === 'light') {
            this.color = '#000000'
        } else {
            this.color = '#ffffff'
        }
    }

    renderCursor(document: vscode.TextDocument, texMath: TexMathEnv, cursorPos?: vscode.Position): Promise<string | undefined> {
        return this.cursorRenderer.renderCursor(document, texMath, this.color, cursorPos)
    }

    findHoverOnTex(document: ITextDocumentLike, position: vscode.Position): TexMathEnv | undefined {
        return this.texMathEnvFinder.findHoverOnTex(document, position)
    }

    async findHoverOnRef(labelDef: LabelDefinitionEntry, token: string) {
        const document = await TextDocumentLike.load(labelDef.file)
        const position = labelDef.position
        return this.texMathEnvFinder.findHoverOnRef(document, position, labelDef, token)
    }

    async renderSvgOnRef(tex: TexMathEnv, labelDef: LabelDefinitionEntry, ctoken: vscode.CancellationToken) {
        const newCommand = await this.findProjectNewCommand(ctoken)
        return this.hoverPreviewOnRefProvider.renderSvgOnRef(tex, newCommand, labelDef, this.color)
    }

    findMathEnvIncludingPosition(document: ITextDocumentLike, position: vscode.Position): TexMathEnv | undefined {
        return this.texMathEnvFinder.findMathEnvIncludingPosition(document, position)
    }

}
