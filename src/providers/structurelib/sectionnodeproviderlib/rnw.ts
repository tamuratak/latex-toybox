import { InputFileRegExp } from '../../../utils/inputfilepath'


export async function parseRnwChildCommand(content: string, file: string, rootFile: string) {
    const children: {subFile: string, line: number}[] = []
    const childRegExp = new InputFileRegExp()
    while(true) {
        const result = await childRegExp.execChild(content, file, rootFile)
        if (!result) {
            break
        }
        const line = (content.slice(0, result.match.index).match(/\n/g) || []).length
        children.push({subFile: result.path, line})
    }
    return children
}
