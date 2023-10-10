import * as vscode from 'vscode'


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
