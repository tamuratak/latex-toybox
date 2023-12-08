import * as vscode from 'vscode'
import * as path from 'node:path'
import * as utils from '../../utils/utils.js'

import { existsPath } from '../../lib/lwfs/lwfs.js'
import type { Logger } from '../logger.js'
import type { Manager } from '../manager.js'
import { isRunningOnWebWorker } from '../../utils/web.js'


export class PathUtils {

    constructor(private readonly extension: {
        readonly logger: Logger,
        readonly manager: Manager
    }) { }

    private get rootDir() {
        return this.extension.manager.rootDir
    }

    private getOutDir(texFile: string) {
        return this.extension.manager.getOutDir(texFile)
    }

    /**
     * Search for a `.fls` file associated to a tex file
     * @param texFile The path of LaTeX file
     * @return The path of the .fls file or undefined
     */
    async getFlsFilePath(texFile: string) {
        const rootDir = path.dirname(texFile)
        const outDir = this.getOutDir(texFile)
        const baseName = path.parse(texFile).name
        const flsFile = path.resolve(rootDir, path.join(outDir, baseName + '.fls'))
        if (!await existsPath(flsFile)) {
            this.extension.logger.info(`Cannot find fls file: ${flsFile}`)
            return undefined
        }
        this.extension.logger.info(`Fls file found: ${flsFile}`)
        return flsFile
    }

    parseFlsContent(content: string, rootDir: string): {input: string[], output: string[]} {
        const inputFiles: Set<string> = new Set()
        const outputFiles: Set<string> = new Set()
        const regex = /^(?:(INPUT)\s*(.*))|(?:(OUTPUT)\s*(.*))$/gm
        // regex groups
        // #1: an INPUT entry --> #2 input file path
        // #3: an OUTPUT entry --> #4: output file path
        while (true) {
            const result = regex.exec(content)
            if (!result) {
                break
            }
            if (result[1]) {
                const inputFilePath = path.resolve(rootDir, result[2])
                if (inputFilePath) {
                    inputFiles.add(inputFilePath)
                }
            } else if (result[3]) {
                const outputFilePath = path.resolve(rootDir, result[4])
                if (outputFilePath) {
                    outputFiles.add(outputFilePath)
                }
            }
        }

        return {input: Array.from(inputFiles), output: Array.from(outputFiles)}
    }

    private kpsewhichBibPath(bib: string): string | undefined {
        const kpsewhich = vscode.workspace.getConfiguration('latex-toybox').get('kpsewhich.path') as string
        this.extension.logger.info(`Calling ${kpsewhich} to resolve file: ${bib}`)
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
            const cs = require('cross-spawn') as typeof import('cross-spawn')
            const kpsewhichReturn = cs.sync(kpsewhich, ['-format=.bib', bib])
            if (kpsewhichReturn.status === 0) {
                const bibPath = kpsewhichReturn.stdout.toString().replace(/\r?\n/, '')
                if (bibPath === '') {
                    return undefined
                } else {
                    this.extension.logger.info(`Found .bib file using kpsewhich: ${bibPath}`)
                    return bibPath
                }
            }
        } catch (e) {
            this.extension.logger.info(`Cannot run kpsewhich to resolve .bib file: ${bib}`)
            this.extension.logger.logError(e)
        }
        return undefined
    }

    async resolveBibPath(bib: string, baseDir: string) {
        const configuration = vscode.workspace.getConfiguration('latex-toybox')
        const bibDirs = configuration.get('latex.bibDirs') as string[]
        let searchDirs: string[]
        if (this.rootDir) {
            // chapterbib requires to load the .bib file in every chapter using
            // the path relative to the rootDir
            searchDirs = [this.rootDir, baseDir, ...bibDirs]
        } else {
            searchDirs = [baseDir, ...bibDirs]
        }
        const bibPath = await utils.findFileInDirs(searchDirs, bib, '.bib')

        if (!bibPath) {
            this.extension.logger.info(`Cannot find .bib file: ${bib}`)
            if (configuration.get('kpsewhich.enabled') && !isRunningOnWebWorker()) {
                return this.kpsewhichBibPath(bib)
            } else {
                return undefined
            }
        }
        this.extension.logger.info(`Found .bib file: ${bibPath}`)
        return bibPath
    }

}
