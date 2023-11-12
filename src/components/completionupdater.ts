import { latexParser } from 'latex-utensils'
import * as vscode from 'vscode'
import { CommandUpdater } from './completionupdaterlib/commandupdater.js'
import { EnvironmentUpdater } from './completionupdaterlib/environmentupdater.js'
import { LabelDefinitionUpdater } from './completionupdaterlib/labeldefinitionupdater.js'
import { GlossaryUpdater } from './completionupdaterlib/glossaryupdater.js'
import { CitationUpdater } from './completionupdaterlib/citationupdater.js'
import { statPath } from '../lib/lwfs/lwfs.js'
import { isCacheLatest } from '../utils/utils.js'
import type { EventBus } from './eventbus.js'
import type { Completer } from '../providers/completion.js'
import type { Logger } from './logger.js'
import type { Manager } from './manager.js'
import type { LatexAstManager } from './astmanager.js'


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
        if (cache && isCacheLatest(cache.element, stat) && isContentOnDisk) {
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
