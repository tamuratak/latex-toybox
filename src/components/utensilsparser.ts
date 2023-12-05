import type { latexParser, bibtexParser } from 'latex-utensils'
import * as path from 'node:path'
import * as workerpool from 'workerpool'
import type { Proxy } from 'workerpool'
import type { IUtensilsParserWorker } from './utensilsparserlib/utensilsparser_worker.js'
import { isRunningOnWebWorker } from '../utils/utils.js'


export class UtensilsParser {
    private readonly pool: workerpool.WorkerPool
    private readonly proxy: workerpool.Promise<Proxy<IUtensilsParserWorker>>

    constructor() {
        if (isRunningOnWebWorker()) {
            throw new Error('UtensilsParser cannot be used in a web worker.')
        } else {
            this.pool = workerpool.pool(
                path.join(__dirname, 'utensilsparserlib', 'utensilsparser_worker.js'),
                { minWorkers: 1, maxWorkers: 1, workerType: 'thread' }
            )
        }
        this.proxy = this.pool.proxy<IUtensilsParserWorker>()
    }

    async dispose() {
        await this.pool.terminate(true)
    }

    /**
     * Parse a LaTeX file.
     *
     * @param s The content of a LaTeX file to be parsed.
     * @param options
     * @return undefined if parsing fails
     */
    async parseLatex(s: string, options?: latexParser.ParserOptions): Promise<latexParser.LatexAst | undefined> {
        return (await this.proxy).parseLatex(s, options).timeout(3000).catch(() => undefined)
    }

    async parseLatexPreamble(s: string): Promise<latexParser.AstPreamble> {
        return (await this.proxy).parseLatexPreamble(s).timeout(500)
    }

    async parseBibtex(s: string, options?: bibtexParser.ParserOptions): Promise<bibtexParser.BibtexAst> {
        return (await this.proxy).parseBibtex(s, options).timeout(30000)
    }

}
