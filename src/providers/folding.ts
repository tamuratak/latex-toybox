import * as vscode from 'vscode'
import type { Manager } from '../components/manager.js'


export class FoldingProvider implements vscode.FoldingRangeProvider {
    private sectionRegex: RegExp[]

    constructor(private readonly extension: {
        readonly manager: Manager
    }) {
        this.sectionRegex = this.createSectionRegex()
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('latex-toybox.view.outline.sections', this.extension.manager.getWorkspaceFolderRootDir())) {
                this.sectionRegex = this.createSectionRegex()
            }
        })
    }

    private createSectionRegex() {
        const sections = vscode.workspace.getConfiguration('latex-toybox').get<string[]>('view.outline.sections', [])
        return sections.map(section => new RegExp(`\\\\(?:${section})(?:\\*)?(?:\\[[^\\[\\]\\{\\}]*\\])?{(.*)}`, 'm'))
    }

    public provideFoldingRanges(document: vscode.TextDocument): vscode.FoldingRange[] {
        return [...this.getSectionFoldingRanges(document), ...this.getEnvironmentFoldingRanges(document)]
    }

    private getSectionFoldingRanges(document: vscode.TextDocument) {
        const startingIndices: number[] = this.sectionRegex.map(_ => -1)
        const lines = document.getText().split(/\r?\n/g)
        let documentClassLine = -1

        const sections: {level: number, from: number, to: number}[] = []
        let index = -1
        let lastNonemptyLineIndex = -1
        for (const line of lines) {
            index++
            for (const regex of this.sectionRegex) {
                const result = regex.exec(line)
                if (!result) {
                    continue
                }
                const regIndex = this.sectionRegex.indexOf(regex)
                const originalIndex = startingIndices[regIndex]
                if (originalIndex === -1) {
                    startingIndices[regIndex] = index
                    continue
                }
                let i = regIndex
                while (i < this.sectionRegex.length) {
                    sections.push({
                        level: i,
                        from: startingIndices[i],
                        to: lastNonemptyLineIndex
                    })
                    startingIndices[i] = regIndex === i ? index : -1
                    ++i
                }
            }
            if (/\\documentclass/.exec(line)) {
                documentClassLine = index
            }
            if (/\\begin{document}/.exec(line) && documentClassLine > -1) {
                sections.push({
                    level: 0,
                    from: documentClassLine,
                    to: lastNonemptyLineIndex
                })
            }
            if (/\\end{document}/.exec(line) || index === lines.length - 1) {
                for (let i = 0; i < startingIndices.length; ++i) {
                    if (startingIndices[i] === -1) {
                        continue
                    }
                    sections.push({
                        level: i,
                        from: startingIndices[i],
                        to: lastNonemptyLineIndex
                    })
                }
            }
            if (! line.match(/^\s*$/)) {
                lastNonemptyLineIndex = index
            }
        }

        return sections.map(section => new vscode.FoldingRange(section.from, section.to))
    }

    private getEnvironmentFoldingRanges(document: vscode.TextDocument) {
        const ranges: vscode.FoldingRange[] = []
        const opStack: { keyword: string, index: number }[] = []
        const text: string = document.getText()
        const envRegex = /\\(begin){(.*?)}|\\(begingroup)[%\s\\]|\\(end){(.*?)}|\\(endgroup)[%\s\\]|^%\s*#?([rR]egion)|^%\s*#?([eE]ndregion)/gm //to match one 'begin' OR 'end'

        while (true) {
            const match = envRegex.exec(text)
            if (match === null) {
                //TODO: if opStack still not empty
                return ranges
            }
            //for 'begin': match[1] contains 'begin', match[2] contains keyword
            //for 'end':   match[4] contains 'end',   match[5] contains keyword
            //for 'begingroup': match[3] contains 'begingroup', keyword is 'group'
            //for 'endgroup': match[6] contains 'endgroup', keyword is 'group'
            //for '% region': match[7] contains 'region', keyword is 'region'
            //for '% endregion': match[8] contains 'endregion', keyword is 'region'
            let keyword: string = ''
            if (match[1]) {
                keyword = match[2]
            } else if (match[4]) {
                keyword = match[5]
            } else if (match[3] || match[6]) {
                keyword = 'group'
            } else if (match[7] || match[8]) {
                keyword = 'region'
            }

            const item = {
                keyword,
                index: match.index
            }
            const lastItem = opStack[opStack.length - 1]

            if ((match[4] || match[6] || match[8]) && lastItem && lastItem.keyword === item.keyword) { // match 'end' with its 'begin'
                opStack.pop()
                ranges.push(new vscode.FoldingRange(
                    document.positionAt(lastItem.index).line,
                    document.positionAt(item.index).line - 1
                ))
            } else {
                opStack.push(item)
            }
        }
    }
}
