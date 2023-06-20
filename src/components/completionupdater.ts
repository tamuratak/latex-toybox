import * as utils from '../utils/utils'
import {latexParser} from 'latex-utensils'
import * as vscode from 'vscode'
import {CommandUpdater} from './completionupdaterlib/commandupdater'
import {EnvironmentUpdater} from './completionupdaterlib/environmentupdater'
import {LabelDefinitionUpdater} from './completionupdaterlib/labeldefinitionupdater'
import {GlossaryUpdater} from './completionupdaterlib/glossaryupdater'
import { CitationUpdater } from './completionupdaterlib/citationupdater'
import { statPath } from '../lib/lwfs/lwfs'
import type { EventBus } from './eventbus'
import type { Completer } from '../providers/completion'
import type { Logger } from './logger'
import type { Manager } from './manager'
import type { LatexAstManager } from './astmanager'


export class CompletionUpdater {
    private readonly citationUpdater: CitationUpdater
    private readonly commandUpdater: CommandUpdater
    private readonly environmentUpdater: EnvironmentUpdater
    private readonly referenceUpdater: LabelDefinitionUpdater
    private readonly glossaryUpdater: GlossaryUpdater

    constructor(private readonly extension: {
        readonly eventBus: EventBus,
        readonly completer: Completer,
        readonly logger: Logger,
        readonly manager: Manager,
        readonly latexAstManager: LatexAstManager
    }) {
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
    async updateCompleter(file: string, {content, doc}: {content: string, doc: vscode.TextDocument | undefined}) {
        const isContentOnDisk = !doc?.isDirty
        this.citationUpdater.update(file, content)
        const stat = await statPath(file)
        const cache = this.extension.manager.getCachedContent(file)
        if (cache && stat.mtime <= cache.element.mtime && isContentOnDisk) {
            return
        }
        const languageId: string | undefined = vscode.window.activeTextEditor?.document.languageId
        let latexAst: latexParser.AstRoot | latexParser.AstPreamble | undefined = undefined
        if (!languageId || languageId !== 'latex-expl3') {
            latexAst = await this.extension.latexAstManager.getAst(vscode.Uri.file(file))
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
        if (cache) {
            if (isContentOnDisk) {
                cache.element.mtime = stat.mtime
            } else {
                cache.element.mtime = 0
            }
        }
        await this.extension.eventBus.completionUpdated.fire(file)
    }
}
