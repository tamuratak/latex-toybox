import * as vscode from 'vscode'
import * as path from 'path'

import { resolveFile } from './utils'

enum MatchType {
    Input,
    Child
}

interface MatchPath {
    readonly type: MatchType,
    readonly path: string,
    readonly directory: string,
    readonly matchedString: string,
    readonly index: number
}

export class InputFileRegExp {
    private readonly inputReg = /\\(?:input|InputIfFileExists|include|SweaveInput|subfile|loadglsentries|(?:(?:sub)?(?:import|inputfrom|includefrom)\*?{([^}]*)}))(?:\[[^[\]{}]*\])?{([^}]*)}/g
    private readonly childReg = /<<(?:[^,]*,)*\s*child='([^']*)'\s*(?:,[^,]*)*>>=/g

    /**
     * Return the matched input path. If there is no match, return undefined
     *
     * @param content the string to match the regex on
     * @param currentFile is the name of file in which the regex is executed
     * @param rootFile
     */
    async execInput(content: string, currentFile: string, rootFile: string) {
        const result = this.inputReg.exec(content)
        if (result) {
            const match = {
                type: MatchType.Input,
                path: result[2],
                directory: result[1],
                matchedString: result[0],
                index: result.index
            }
            const filePath = await this.parseInputFilePath(match, currentFile, rootFile)
            return filePath ? {path: filePath, match} : undefined
        }
        return undefined
    }

    /**
     * Return the matched child path. If there is no match, return undefined
     *
     * @param content the string to match the regex on
     * @param currentFile is the name of file in which the regex is executed
     * @param rootFile
     */
    async execChild(content: string, currentFile: string, rootFile: string) {
        const result = this.childReg.exec(content)
        if (result) {
            const match = {
                type: MatchType.Child,
                path: result[1],
                directory: '',
                matchedString: result[0],
                index: result.index
            }
            const filePath = await this.parseInputFilePath(match, currentFile, rootFile)
            return filePath ? {path: filePath, match} : undefined
        }
        return undefined
    }

    /**
     * Return the matched input or child path. If there is no match, return
     * undefined
     *
     * @param content the string to match the regex on
     * @param currentFile is the name of file in which the regex is executed
     * @param rootFile
     */
    async exec(content: string, currentFile: string, rootFile: string) {
        return await this.execInput(content, currentFile, rootFile)
               || await this.execChild(content, currentFile, rootFile)
    }

    /**
     * Compute the resolved file path from matches of this.inputReg or this.childReg
     *
     * @param match is the the result of this.inputReg.exec() or this.childReg.exec()
     * @param currentFile is the name of file in which the match has been obtained
     * @param rootFile
     */
    private parseInputFilePath(match: MatchPath, currentFile: string, rootFile: string) {
        const texDirs = vscode.workspace.getConfiguration('latex-workshop').get('latex.texDirs') as string[]
        /* match of this.childReg */
        if (match.type === MatchType.Child) {
            return resolveFile([path.dirname(currentFile), path.dirname(rootFile), ...texDirs], match.path)
        }

        /* match of this.inputReg */
        if (match.type === MatchType.Input) {
            if (match.matchedString.startsWith('\\subimport') || match.matchedString.startsWith('\\subinputfrom') || match.matchedString.startsWith('\\subincludefrom')) {
                return resolveFile([path.dirname(currentFile)], path.join(match.directory, match.path))
            } else if (match.matchedString.startsWith('\\import') || match.matchedString.startsWith('\\inputfrom') || match.matchedString.startsWith('\\includefrom')) {
                return resolveFile([match.directory, path.join(path.dirname(rootFile), match.directory)], match.path)
            } else {
                return resolveFile([path.dirname(currentFile), path.dirname(rootFile), ...texDirs], match.path)
            }
        }
        return undefined
    }
}
