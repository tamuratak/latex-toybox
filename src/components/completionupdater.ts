import * as utils from '../utils/utils'
import {latexParser} from 'latex-utensils'
import * as vscode from 'vscode'
import {CommandUpdater} from './completionupdaterlib/commandupdater'
import {EnvironmentUpdater} from './completionupdaterlib/environmentupdater'
import {LabelDefinitionUpdater} from './completionupdaterlib/labeldefinitionupdater'
import {GlossaryUpdater} from './completionupdaterlib/glossaryupdater'
import { CitationUpdater } from './completionupdaterlib/citationupdater'
import type { CompleterLocator, EventBusLocator, ICompleteionUpdater, LoggerLocator, ManagerLocator, UtensilsParserLocator } from '../interfaces'

interface IExtension extends
    EventBusLocator,
    CompleterLocator,
    LoggerLocator,
    ManagerLocator,
    UtensilsParserLocator { }

export class CompletionUpdater implements ICompleteionUpdater {
    private readonly extension: IExtension
    private readonly citationUpdater: CitationUpdater
    private readonly commandUpdater: CommandUpdater
    private readonly environmentUpdater: EnvironmentUpdater
    private readonly referenceUpdater: LabelDefinitionUpdater
    private readonly glossaryUpdater: GlossaryUpdater

    constructor(extension: IExtension) {
        this.extension = extension
        this.environmentUpdater = new EnvironmentUpdater(extension)
        this.citationUpdater = new CitationUpdater(extension)
        this.commandUpdater = new CommandUpdater(extension)
        this.referenceUpdater = new LabelDefinitionUpdater(extension)
        this.glossaryUpdater = new GlossaryUpdater(extension)
    }

    get definedCmds() {
        return this.commandUpdater.commandFinder.definedCmds
    }

    /**
     * Updates all completers upon tex-file changes, or active file content is changed.
     */
    async updateCompleter(file: string, content: string) {
        this.citationUpdater.update(file, content)
        const languageId: string | undefined = vscode.window.activeTextEditor?.document.languageId
        let latexAst: latexParser.AstRoot | latexParser.AstPreamble | undefined = undefined
        if (!languageId || languageId !== 'latex-expl3') {
            latexAst = await this.extension.utensilsParser.parseLatex(content)
        }

        if (latexAst) {
            const nodes = latexAst.content
            const lines = content.split('\n')
            this.referenceUpdater.update(file, nodes, lines)
            this.glossaryUpdater.update(file, nodes)
            this.environmentUpdater.update(file, nodes, lines)
            this.commandUpdater.update(file, nodes)
        } else {
            this.extension.logger.info(`Cannot parse a TeX file: ${file}`)
            this.extension.logger.info('Fall back to regex-based completion.')
            // Do the update with old style.
            const contentNoComment = utils.stripCommentsAndVerbatim(content)
            this.referenceUpdater.update(file, undefined, undefined, contentNoComment)
            this.glossaryUpdater.update(file, undefined, contentNoComment)
            this.environmentUpdater.update(file, undefined, undefined, contentNoComment)
            this.commandUpdater.update(file, undefined, contentNoComment)
        }
        await this.extension.eventBus.completionUpdated.fire(file)
    }
}
