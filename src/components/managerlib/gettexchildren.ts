import * as path from 'path'
import * as utils from '../../utils/utils'

import { existsPath, readFilePathGracefully } from '../../lib/lwfs/lwfs'
import { InputFileRegExp } from '../../utils/inputfilepath'

/**
 * Return the list of files (recursively) included in `file`
 *
 * @param file The file in which children are recursively computed
 * @param maybeRootFile The file currently considered as the rootFile
 *
 */
export async function getTeXChildren(file: string, maybeRootFile: string, children = new Set<string>()): Promise < string[] > {
    let content = await readFilePathGracefully(file) || ''
        content = utils.stripCommentsAndVerbatim(content)

        const inputFileRegExp = new InputFileRegExp()
        const newChildren = new Set<string>()
        while(true) {
        const result = await inputFileRegExp.exec(content, file, maybeRootFile)
        if (!result) {
            break
        }
        if (!await existsPath(result.path) || path.relative(result.path, maybeRootFile) === '') {
            continue
        }
        newChildren.add(result.path)
    }

        for(const childFilePath of newChildren) {
        if (children.has(childFilePath)) {
            continue
        }
        children.add(childFilePath)
        await getTeXChildren(childFilePath, maybeRootFile, children)
    }
        return Array.from(children)
}
