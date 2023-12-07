import * as vscode from 'vscode'
import * as path from 'node:path'
import { existsPath } from '../lib/lwfs/lwfs.js'


export function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

const encoder = new TextEncoder()
// Return the number of bytes of a string in UTF-8 encoding.
export function byteLengthAsUtf8(str: string) {
    return encoder.encode(str).length
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

export function isCacheLatest(cache: { readonly mtime: number }, stat: vscode.FileStat): boolean {
    return cache.mtime >= stat.mtime
}
