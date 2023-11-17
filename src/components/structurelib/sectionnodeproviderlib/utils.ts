import { Section } from '../../structure.js'


export function setLastLineOfEachSection(structure: Section[], lastLine: number) {
    const sections = structure.filter(section => section.depth >= 0)
    sections.forEach(section => {
        const sameFileSections = sections.filter(candidate =>
            (candidate.fileName === section.fileName) &&
            (candidate.lineNumber >= section.lineNumber) &&
            (candidate !== section))
        if (sameFileSections.length > 0 && sameFileSections[0].lineNumber === section.lineNumber) {
            // On the same line, e.g., \section{one}\section{two}
            return
        } else if (sameFileSections.length > 0) {
            section.lastLine = sameFileSections[0].lineNumber - 1
        } else {
            section.lastLine = lastLine
        }
        if (section.children.length > 0) {
            setLastLineOfEachSection(section.children, section.lastLine)
        }
    })
}
