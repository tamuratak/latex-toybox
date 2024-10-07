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
        if(!PDFViewerApplication.findBar.opened && !PDFViewerApplication.pdfSidebar.isOpen && !PDFViewerApplication.secondaryToolbar.isOpen) {
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
    const smallViewMaxWidth = 580 + numPagesWidth + scaleWidth + printerButtonWidth
    const smallViewRule = `@media all and (max-width: ${smallViewMaxWidth}px) { .hiddenSmallView, .hiddenSmallView * { display: none; } }`
    styleSheet.insertRule(smallViewRule)
    const buttonSpacerMaxWidth = 540 + numPagesWidth + scaleWidth + printerButtonWidth
    const buttonSpacerRule = `@media all and (max-width: ${buttonSpacerMaxWidth}px) { .toolbarButtonSpacer { width: 0; } }`
    styleSheet.insertRule(buttonSpacerRule)
    const scaleMaxWidth = 500 + numPagesWidth + scaleWidth + printerButtonWidth
    const scaleRule = `@media all and (max-width: ${scaleMaxWidth}px) { #scaleSelectContainer { display: none; } }`
    styleSheet.insertRule(scaleRule)
    const trimMaxWidth = 500 + numPagesWidth + printerButtonWidth
    const trimRule = `@media all and (max-width: ${trimMaxWidth}px) { #trimSelectContainer { display: none; } }`
    styleSheet.insertRule(trimRule)
    document.adoptedStyleSheets.push(styleSheet)
}
