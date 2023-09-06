import * as vscode from 'vscode'
import {CiteSuggestion, Fields} from '../../providers/completer/citation'
import type { Logger } from '../logger'
import type { Manager } from '../manager'
import { ReferenceKind } from '../../providers/completer/completionkind'


export class CitationUpdater {

    constructor(private readonly extension: {
        readonly logger: Logger,
        readonly manager: Manager
    }) { }

    /**
     * Updates the Manager cache for bibitems defined in `file`.
     * `content` is parsed with regular expressions,
     * and the result is used to update the cache.
     *
     * @param file The path of a LaTeX file.
     * @param content The content of a LaTeX file.
     */
    update(file: string, content: string) {
        const cache = this.extension.manager.getCachedContent(file)
        if (cache !== undefined) {
            cache.element.bibitem = this.parseContent(file, content)
        }
    }

    private parseContent(file: string, content: string): CiteSuggestion[] {
        const itemReg = /^(?!%).*\\bibitem(?:\[[^[\]{}]*\])?{([^}]*)}/gm
        const items: CiteSuggestion[] = []
        while (true) {
            const result = itemReg.exec(content)
            if (result === null) {
                break
            }
            const postContent = content.substring(result.index + result[0].length, content.indexOf('\n', result.index)).trim()
            const positionContent = content.substring(0, result.index).split('\n')
            items.push({
                key: result[1],
                label: result[1],
                file,
                kind: ReferenceKind,
                detail: `${postContent}\n...`,
                fields: new Fields(),
                position: new vscode.Position(positionContent.length - 1, positionContent[positionContent.length - 1].length)
            })
        }
        return items
    }

}
