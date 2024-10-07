import { elementWidth, isEmbedded } from '../utils/utils.js'
import type { IPDFViewerApplication } from './interface.js'

declare const PDFViewerApplication: IPDFViewerApplication


let hideToolbarInterval: number | undefined

export function showToolbar(animate: boolean) {
    if (hideToolbarInterval !== undefined) {
        clearInterval(hideToolbarInterval)
    }
    const toolbarDiv = document.getElementsByClassName('toolbar')[0]
    if (!toolbarDiv) {
        throw new Error('toolbarDiv is undefined.')
    }
    toolbarDiv.classList.remove('hide')
    if (!animate) {
        toolbarDiv.classList.add('notransition')
    }
    hideToolbarInterval = setInterval(() => {
        if (!PDFViewerApplication.findBar.opened && !PDFViewerApplication.pdfSidebar.isOpen && !PDFViewerApplication.secondaryToolbar.isOpen) {
            toolbarDiv.classList.remove('notransition')
            toolbarDiv.classList.add('hide')
            clearInterval(hideToolbarInterval)
        }
    }, 3000)
}

export function hidePrintButton() {
    if (isEmbedded) {
        const dom = document.getElementById('printButton') as HTMLElement
        dom.style.display = 'none'
    }
}

// Since the width of the selector of scaling depends on each locale,
// we have to set its `max-width` dynamically on initialization.
export function setCssRuleForToolbar() {
    const styleSheet = new CSSStyleSheet()
    const scaleSelectContainer = document.getElementById('scaleSelectContainer') as HTMLElement
    const scaleWidth = elementWidth(scaleSelectContainer)
    const numPages = document.getElementById('numPages') as HTMLElement
    const numPagesWidth = elementWidth(numPages)
    const printerButtonWidth = isEmbedded ? 0 : 34
    // The constant must be larger than 366 = 28 + 28 + 28 + 30 + 28 + 28 + 28 + 56 + 28 + 28 + 28 + 28
    // It is the sum of the widths of the elements in the toolbar except for numPages and printerButton.
    const trimMaxWidth = 500 + numPagesWidth + printerButtonWidth
    const scaleMaxWidth = scaleWidth + trimMaxWidth
    // The constant must be larger than 86 = 28 + 28 + 30
    // It is the sum of the widths of toolbarButtonSpacer, previous, and next.
    const smallViewMaxWidth = 86 + scaleMaxWidth
    styleSheet.insertRule(` @media all and (max-width: ${smallViewMaxWidth}px) {
    .hiddenSmallView, .hiddenSmallView * { display: none; }
    .toolbarButtonSpacer { width: 0 !important; }
}`)
    styleSheet.insertRule(`@media all and (max-width: ${scaleMaxWidth}px) { #scaleSelectContainer { display: none; } }`)
    styleSheet.insertRule(`@media all and (max-width: ${trimMaxWidth}px) { #trimSelectContainer { display: none; } }`)
    document.adoptedStyleSheets.push(styleSheet)
}
