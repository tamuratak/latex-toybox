import { latexParser } from 'latex-utensils'


/**
 * This function tries to figure the caption of a `frame`, `figure`, or
 * `table` using their respective syntax.
 *
 * @param node The environment node to be parsed
 * @returns The caption found, or 'Untitled'.
 */
export function findEnvCaption(node: latexParser.Environment): string {
    let captionNode: latexParser.Command | undefined
    let caption = 'Untitled'
    if (node.name.replace(/\*$/, '') === 'frame') {
        // Frame titles can be specified as either \begin{frame}{Frame Title}
        // or \begin{frame} \frametitle{Frame Title}
        // \begin{frame}(whitespace){Title} will set the title as long as the whitespace contains no more than 1 newline

        captionNode = node.content.filter(latexParser.isCommand).find(subNode => subNode.name.replace(/\*$/, '') === 'frametitle')

        // \begin{frame}(whitespace){Title}
        const nodeArg = node.args.find(latexParser.isGroup)
        caption = nodeArg ? captionify(nodeArg) : caption
    } else if (node.name.replace(/\*$/, '') === 'figure' || node.name.replace(/\*$/, '') === 'table') {
        // \begin{figure} \caption{Figure Title}
        captionNode = node.content.filter(latexParser.isCommand).find(subNode => subNode.name.replace(/\*$/, '') === 'caption')
    }
    // \frametitle can override title set in \begin{frame}{<title>}
    // \frametitle{Frame Title} or \caption{Figure Title}
    if (captionNode) {
        const arg = captionNode.args.find(latexParser.isGroup)
        caption = arg ? captionify(arg) : caption
    }
    return caption
}

export function captionify(argNode: latexParser.Group | latexParser.OptionalArg): string {
    for (let index = 0; index < argNode.content.length; ++index) {
        const node = argNode.content[index]
        if (latexParser.isCommand(node)
            && node.name === 'texorpdfstring'
            && node.args.length === 2) {
            const pdfString = latexParser.stringify(node.args[1])
            const firstArg = node.args[1].content[0]
            if (latexParser.isTextString(firstArg)) {
                firstArg.content = pdfString.slice(1, pdfString.length - 1)
                argNode.content[index] = firstArg
            }
        }
    }
    const caption = latexParser.stringify(argNode).replace(/\n/g, ' ')
    return caption.slice(1, caption.length - 1) // {Title} -> Title
}
