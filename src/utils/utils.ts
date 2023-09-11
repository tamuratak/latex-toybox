import * as vscode from 'vscode'
import * as path from 'path'

import {latexParser} from 'latex-utensils'
import { existsPath } from '../lib/lwfs/lwfs'


export function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

export function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
}

export function escapeRegExp(str: string) {
    return str.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&')
}

/**
 * Remove comments
 *
 * @param text A string in which comments get removed.
 * @return the input text with comments removed.
 * Note the number lines of the output matches the input
 */
export function stripComments(text: string): string {
    const reg = /(^|[^\\]|(?:(?<!\\)(?:\\\\)+))%.*$/gm
    return text.replace(reg, '$1')
}

/**
 * Remove some environments
 * Note the number lines of the output matches the input
 *
 * @param text A string representing the content of a TeX file
 * @param envs An array of environments to be removed
 *
 */
export function stripEnvironments(text: string, envs: string[]): string {
    const envsAlt = envs.join('|')
    const pattern = `\\\\begin{(${envsAlt})}.*?\\\\end{\\1}`
    const reg = new RegExp(pattern, 'gms')
    return text.replace(reg, (match, ..._args) => {
        const len = Math.max(match.split('\n').length, 1)
        return '\n'.repeat(len - 1)
    })
}

/**
 * Remove comments and verbatim content
 * Note the number lines of the output matches the input
 *
 * @param text A multiline string to be stripped
 * @return the input text with comments and verbatim content removed.
 */
export function stripCommentsAndVerbatim(text: string): string {
    let content = stripComments(text)
    content = content.replace(/\\verb\*?([^a-zA-Z0-9]).*?\1/g, '')
    const configuration = vscode.workspace.getConfiguration('latex-toybox')
    const verbatimEnvs = configuration.get('latex.verbatimEnvs') as string[]
    return stripEnvironments(content, verbatimEnvs)
}

/**
 * Trim leading and ending spaces on every line
 * See https://blog.stevenlevithan.com/archives/faster-trim-javascript for
 * possible ways of implementing trimming
 *
 * @param text a multiline string
 */
export function trimMultiLineString(text: string): string {
    return text.replace(/^\s\s*/gm, '').replace(/\s\s*$/gm, '')
}

export type CommandArgument = {
    arg: string, // The argument we are looking for
    index: number // the starting position of the argument
}

/**
 * Resolve a relative file path to an absolute path using the prefixes `dirs`.
 *
 * @param dirs An array of the paths of directories. They are used as prefixes for `inputFile`.
 * @param inputFile The path of a input file to be resolved.
 * @param suffix The suffix of the input file
 * @return an absolute path or undefined if the file does not exist
 */
export async function findFileInDirs(dirs: string[], inputFile: string, suffix: string = '.tex') {
    if (inputFile.startsWith('/')) {
        dirs.unshift('')
    }
    for (const d of dirs) {
        let inputFilePath = path.resolve(d, inputFile)
        if (path.extname(inputFilePath) === '') {
            inputFilePath += suffix
        }
        if (!await existsPath(inputFilePath) && await existsPath(inputFilePath + suffix)) {
            inputFilePath += suffix
        }
        if (await existsPath(inputFilePath)) {
            return inputFilePath
        }
    }
    return undefined
}

/**
 * Return a function replacing placeholders of LaTeX recipes.
 *
 * @param rootFile The path of the root file.
 * @returns A function replacing placeholders.
 */
export function replaceArgumentPlaceholders(rootFile: string): (arg: string) => string {
    return (arg: string) => {
        const configuration = vscode.workspace.getConfiguration('latex-toybox', vscode.Uri.file(rootFile))

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
        const workspaceDir = workspaceFolder?.uri.fsPath.split(path.sep).join('/') || ''
        const rootFileParsed = path.parse(rootFile)
        const docfile = rootFileParsed.name
        const docfileExt = rootFileParsed.base
        const dirW32 = path.normalize(rootFileParsed.dir)
        const dir = dirW32.split(path.sep).join('/')
        const docW32 = path.join(dirW32, docfile)
        const doc = docW32.split(path.sep).join('/')
        const docExtW32 = path.join(dirW32, docfileExt)
        const docExt = docExtW32.split(path.sep).join('/')
        const relativeDir = path.relative(workspaceDir, dir).split(path.sep).join('/')
        const relativeDoc = path.relative(workspaceDir, doc).split(path.sep).join('/')

        const expandPlaceHolders = (a: string): string => {
            return a.replace(/%DOC%/g, doc)
                    .replace(/%DOC_W32%/g, docW32)
                    .replace(/%DOC_EXT%/g, docExt)
                    .replace(/%DOC_EXT_W32%/g, docExtW32)
                    .replace(/%DOCFILE_EXT%/g, docfileExt)
                    .replace(/%DOCFILE%/g, docfile)
                    .replace(/%DIR%/g, dir)
                    .replace(/%DIR_W32%/g, dirW32)
                    .replace(/%WORKSPACE_FOLDER%/g, workspaceDir)
                    .replace(/%RELATIVE_DIR%/, relativeDir)
                    .replace(/%RELATIVE_DOC%/, relativeDoc)

        }
        const outDirW32 = path.normalize(expandPlaceHolders(configuration.get('latex.outDir') as string))
        const outDir = outDirW32.split(path.sep).join('/')
        return expandPlaceHolders(arg).replace(/%OUTDIR%/g, outDir).replace(/%OUTDIR_W32%/g, outDirW32)
    }
}

export type NewCommand = {
    kind: 'command',
    name: 'renewcommand|newcommand|providecommand|DeclareMathOperator|renewcommand*|newcommand*|providecommand*|DeclareMathOperator*',
    args: (latexParser.OptionalArg | latexParser.Group)[],
    location: latexParser.Location
}

export function isNewCommand(node: latexParser.Node | undefined): node is NewCommand {
    const regex = /^(renewcommand|newcommand|providecommand|DeclareMathOperator)(\*)?$/
    if (latexParser.isCommand(node) && node.name.match(regex)) {
        return true
    }
    return false
}

export type NewEnvironment = {
    kind: 'command',
    name: 'renewenvironment|newenvironment|renewenvironment*|newenvironment*',
    args: (latexParser.OptionalArg | latexParser.Group)[],
    location: latexParser.Location
}

export function isNewEnvironment(node: latexParser.Node | undefined): node is NewEnvironment {
    const regex = /^(renewenvironment|newenvironment)(\*)?$/
    if (latexParser.isCommand(node) && node.name.match(regex)) {
        return true
    }
    return false
}

export function isCacheLatest(cache: { readonly mtime: number }, stat: vscode.FileStat): boolean {
    return cache.mtime >= stat.mtime
}
