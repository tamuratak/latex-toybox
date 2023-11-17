import { Section, SectionKind } from '../../structure.js'

/**
 * This function is responsible for building the hierarchy of a flat array
 * of Section objects based on the input hierarchy data. The process involves
 * two steps. In the first step, all non-section Section objects are placed
 * under their leading section. Additionally, section numbers can be
 * optionally added during this step. In the second step, the section Section
 * objects are iterated to construct the hierarchy. The resulting sections,
 * complete with hierarchy information, are returned.
 *
 * @param flatStructure The flat sections whose hierarchy is to be built.
 * @param showHierarchyNumber Whether the section numbers should be computed
 * and prepended to section captions.
 * @returns The final sections to be shown with hierarchy.
 */
export function buildLaTeXHierarchy(flatStructure: Section[], showHierarchyNumber: boolean): Section[] {
    if (flatStructure.length === 0) {
        return []
    }

    // All non-section nodes before the first section
    const preambleNodes: Section[] = []
    // Only holds section-like Sections
    const flatSections: Section[] = []

    // Calculate the lowest depth. It's possible that there is no `chapter`
    // in a document. In such a case, `section` is the lowest level with a
    // depth 1. However, later logic is 0-based. So.
    let lowest = 65535
    flatStructure.filter(node => node.depth > -1).forEach(section => {
        lowest = lowest < section.depth ? lowest : section.depth
    })

    // Step 1: Put all non-sections into their leading section. This is to
    // make the subsequent logic clearer.

    // This counter is used to calculate the section numbers. The array
    // holds the current numbering. When developing the numbers, just +1 to
    // the appropriate item and retrieve the sub-array.
    let counter: number[] = []
    flatStructure.forEach(node => {
        if (node.depth === -1) {
            // non-section node
            if (flatSections.length === 0) {
                // no section appeared yet
                preambleNodes.push(node)
            } else {
                flatSections[flatSections.length - 1].children.push(node)
            }
        } else {
            if (showHierarchyNumber && node.kind === SectionKind.Section) {
                const depth = node.depth - lowest
                if (depth + 1 > counter.length) {
                    counter = [...counter, ...new Array(depth + 1 - counter.length).fill(0) as number[]]
                } else {
                    counter = counter.slice(0, depth + 1)
                }
                counter[counter.length - 1] += 1
                node.label = `${counter.join('.')} ${node.label}`
            } else if (showHierarchyNumber && node.kind === SectionKind.NoNumberSection) {
                node.label = `* ${node.label}`
            }
            flatSections.push(node)
        }
    })

    const sections: Section[] = []

    flatSections.forEach(section => {
        if (section.depth - lowest === 0) {
            // base level section
            sections.push(section)
        } else if (sections.length === 0) {
            // non-base level section, no previous sections available, create one
            sections.push(section)
        } else {
            // Starting from the last base-level section, find out the
            // proper level.
            let currentSection = sections[sections.length - 1]
            while (currentSection.depth < section.depth - 1) {
                const children = currentSection.children.filter(candidate => candidate.depth > -1)
                if (children.length > 0) {
                    // If there is a section child
                    currentSection = children[children.length - 1]
                } else {
                    // If there is a jump e.g., section -> subsubsection,
                    // give up finding.
                    break
                }
            }
            currentSection.children.push(section)
        }
    })

    return [...preambleNodes, ...sections]
}
