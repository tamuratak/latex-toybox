import type { PdfViewerState } from 'latex-toybox-protocol-types'
import { pdfFilePrefix } from '../utils/encodepdffilepath.js'
import type { ILatexToyboxPdfViewer, IPDFViewerApplication, IPDFViewerApplicationOptions } from './interface.js'
import { debugPrint } from '../utils/debug.js'
import { trimSelectElement, viewerContainer, viewerDom, RenderingStates, ScrollMode } from './constants.js'

declare const PDFViewerApplication: IPDFViewerApplication
declare const PDFViewerApplicationOptions: IPDFViewerApplicationOptions

export class ViewerLoading {
    private readonly lwApp: ILatexToyboxPdfViewer

    constructor(lwApp: ILatexToyboxPdfViewer) {
        this.lwApp = lwApp
    }

    async restorePdfViewerState(state: PdfViewerState) {
        await this.lwApp.pdfViewerStarted
        // By setting the scale, scaling will be invoked if necessary.
        // The scale can be a non-number one.
        if (state.scale !== undefined) {
            PDFViewerApplication.pdfViewer.currentScaleValue = state.scale
        }
        if (state.scrollMode !== undefined) {
            PDFViewerApplication.pdfViewer.scrollMode = state.scrollMode
        }
        if (state.spreadMode !== undefined) {
            PDFViewerApplication.pdfViewer.spreadMode = state.spreadMode
        }
        if (state.page !== undefined && PDFViewerApplication.pdfViewer.scrollMode === ScrollMode.PAGE) {
            PDFViewerApplication.page = state.page
        }
        if (state.scrollTop !== undefined) {
            viewerContainer.scrollTop = state.scrollTop
        }
        if (state.scrollLeft !== undefined) {
            viewerContainer.scrollLeft = state.scrollLeft
        }
        if (state.synctexEnabled !== undefined) {
            this.lwApp.setSynctex(state.synctexEnabled)
        }
        if (state.autoReloadEnabled !== undefined) {
            this.lwApp.setAutoReload(state.autoReloadEnabled)
        }
        if (state.trim !== undefined) {
            const ev = new Event('change')
            // We have to wait for currentScaleValue set above to be effected
            // especially for cases of non-number scales.
            // https://github.com/James-Yu/LaTeX-Workshop/issues/1870
            void this.lwApp.pdfPagesLoaded.then(() => {
                if (state.trim === undefined) {
                    return
                }
                trimSelectElement.selectedIndex = state.trim
                trimSelectElement.dispatchEvent(ev)
                // By setting the scale, the callbacks of trimming pages are invoked.
                // However, given "auto" and other non-number scales, the scale will be
                // unnecessarily recalculated, which we must avoid.
                if (state.scale !== undefined && /\d/.exec(state.scale)) {
                    PDFViewerApplication.pdfViewer.currentScaleValue = state.scale
                }
                if (state.scrollTop !== undefined) {
                    viewerContainer.scrollTop = state.scrollTop
                }
                this.lwApp.sendCurrentStateToPanelManager()
            })
        }
        this.lwApp.sendCurrentStateToPanelManager()
    }

    refreshPDFViewer() {
        if (!this.lwApp.autoReloadEnabled) {
            this.lwApp.addLogMessage('Auto reload temporarily disabled.')
            return
        }
        const pack = {
            page: PDFViewerApplication.page,
            scale: PDFViewerApplication.pdfViewer.currentScaleValue,
            scrollMode: PDFViewerApplication.pdfViewer.scrollMode,
            spreadMode: PDFViewerApplication.pdfViewer.spreadMode,
            scrollTop: viewerContainer.scrollTop,
            scrollLeft: viewerContainer.scrollLeft
        }

        // Note: without showPreviousViewOnLoad = false restoring the position after the refresh will fail if
        // the user has clicked on any link in the past (pdf.js will automatically navigate to that link).
        PDFViewerApplicationOptions.set('showPreviousViewOnLoad', false)
        // Override the spread mode specified in PDF documents with the current one.
        // https://github.com/James-Yu/LaTeX-Workshop/issues/1871
        PDFViewerApplicationOptions.set('spreadModeOnLoad', pack.spreadMode)

        const maskArray = makeMasksForAllVisiblePages()
        void PDFViewerApplication.open({ url: `${pdfFilePrefix}${this.lwApp.encodedPdfFilePath}` }).then(() => {
            // reset the document title to the original value to avoid duplication
            document.title = this.lwApp.documentTitle
        })
        const disposable = this.lwApp.lwEventBus.onPageRendered(() => {
            if (isAllVisiblePagesRendered()) {
                disposable.dispose()
                // Remove the maskt with a transition effect.
                for (const mask of maskArray) {
                    mask.classList.add('removeMask')
                }
                setTimeout(() => {
                    for (const mask of maskArray) {
                        mask.remove()
                    }
                }, 2000)
            }
        })
        this.lwApp.lwEventBus.onPagesInit(() => {
            PDFViewerApplication.pdfViewer.currentScaleValue = pack.scale
            PDFViewerApplication.pdfViewer.scrollMode = pack.scrollMode
            PDFViewerApplication.pdfViewer.spreadMode = pack.spreadMode
            if (pack.scrollMode === ScrollMode.PAGE) {
                PDFViewerApplication.page = pack.page
            } else {
                viewerContainer.scrollTop = pack.scrollTop
                viewerContainer.scrollLeft = pack.scrollLeft
            }
        }, { once: true })
        // The height of each page can change after a `pagesinit` event.
        // We have to set scrollTop on a `pagesloaded` event for that case.
        this.lwApp.lwEventBus.onPagesLoaded(() => {
            viewerContainer.scrollTop = pack.scrollTop
            viewerContainer.scrollLeft = pack.scrollLeft
        }, { once: true })
        this.lwApp.lwEventBus.onPagesLoaded(() => {
            this.lwApp.send({ type: 'loaded', pdfFileUri: this.lwApp.pdfFileUri })
        }, { once: true })
    }

}

/**
 * Mask all visible pages with their rendered images to prevent flickering.
 */
function makeMasksForAllVisiblePages() {
    const maskArray: HTMLDivElement[] = []
    if (!viewerContainer || !viewerDom) {
        return maskArray
    }
    const visiblePages = PDFViewerApplication.pdfViewer._getVisiblePages()
    for (const visiblePage of visiblePages.views) {
        const page = visiblePage.view.div
        const canvas = visiblePage.view.canvas
        if (!canvas) {
            continue
        }
        const div = document.createElement('div')
        div.className = 'divMask'
        maskArray.push(div)
        div.style.display = 'none'
        div.style.top = page.offsetTop + 'px'
        div.style.left = page.offsetLeft + 'px'
        div.style.width = Math.min(viewerDom.clientWidth, page.clientWidth) + 'px'
        div.style.height = page.clientHeight + 'px'
        const img = new Image()
        img.src = canvas.toDataURL() ?? ''
        img.style.left = canvas.offsetLeft + 'px'
        img.style.width = canvas.clientWidth + 'px'
        img.style.height = canvas.clientHeight + 'px'
        div.appendChild(img)
        viewerContainer.appendChild(div)
        div.style.display = 'inherit'
        debugPrint('page')
        debugPrint({ offsetTop: page.offsetTop, offetLeft: page.offsetLeft, width: page.clientWidth, height: page.clientHeight})
        debugPrint('canvas')
        debugPrint({ offsetTop: canvas.offsetTop, offetLeft: canvas.offsetLeft, width: canvas.clientWidth, height: canvas.clientHeight})
        debugPrint('div')
        debugPrint({ offsetTop: div.offsetTop, offetLeft: div.offsetLeft, width: div.clientWidth, height: div.clientHeight})
        debugPrint('img')
        debugPrint({ offsetTop: img.offsetTop, offetLeft: img.offsetLeft, width: img.clientWidth, height: img.clientHeight})
    }
    return maskArray
}

export function isAllVisiblePagesRendered(): boolean {
    const pageViews = PDFViewerApplication.pdfViewer._getVisiblePages()
    debugPrint('pageViews')
    debugPrint(pageViews.ids)
    debugPrint('renderingState')
    debugPrint(pageViews.views.map(view => view.view.renderingState))
    return pageViews.views.every(view => view.view.renderingState === RenderingStates.FINISHED)
}
