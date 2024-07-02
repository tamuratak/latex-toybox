import type { PdfViewerState } from 'latex-toybox-protocol-types'
import { pdfFilePrefix } from '../utils/encodepdffilepath.js'
import type { ILatexToyboxPdfViewer, IPDFViewerApplication, IPDFViewerApplicationOptions } from './interface.js'
import { RenderingStates, ScrollMode } from './enums.js'
import { debugPrint } from '../utils/debug.js'
import { isTrimEnabled } from './pagetrimmer.js'

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
            (document.getElementById('viewerContainer') as HTMLElement).scrollTop = state.scrollTop
        }
        if (state.scrollLeft !== undefined) {
            (document.getElementById('viewerContainer') as HTMLElement).scrollLeft = state.scrollLeft
        }
        if (state.synctexEnabled !== undefined) {
            this.lwApp.setSynctex(state.synctexEnabled)
        }
        if (state.autoReloadEnabled !== undefined) {
            this.lwApp.setAutoReload(state.autoReloadEnabled)
        }
        if (state.trim !== undefined) {
            const trimSelect = document.getElementById('trimSelect') as HTMLSelectElement
            const ev = new Event('change')
            // We have to wait for currentScaleValue set above to be effected
            // especially for cases of non-number scales.
            // https://github.com/James-Yu/LaTeX-Workshop/issues/1870
            void this.lwApp.pdfPagesLoaded.then(() => {
                if (state.trim === undefined) {
                    return
                }
                trimSelect.selectedIndex = state.trim
                trimSelect.dispatchEvent(ev)
                // By setting the scale, the callbacks of trimming pages are invoked.
                // However, given "auto" and other non-number scales, the scale will be
                // unnecessarily recalculated, which we must avoid.
                if (state.scale !== undefined && /\d/.exec(state.scale)) {
                    PDFViewerApplication.pdfViewer.currentScaleValue = state.scale
                }
                if (state.scrollTop !== undefined) {
                    (document.getElementById('viewerContainer') as HTMLElement).scrollTop = state.scrollTop
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
            scrollTop: (document.getElementById('viewerContainer') as HTMLElement).scrollTop,
            scrollLeft: (document.getElementById('viewerContainer') as HTMLElement).scrollLeft
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
                    mask.className = 'removeMask'
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
                (document.getElementById('viewerContainer') as HTMLElement).scrollTop = pack.scrollTop;
                (document.getElementById('viewerContainer') as HTMLElement).scrollLeft = pack.scrollLeft
            }
        }, { once: true })
        // The height of each page can change after a `pagesinit` event.
        // We have to set scrollTop on a `pagesloaded` event for that case.
        this.lwApp.lwEventBus.onPagesLoaded(() => {
            (document.getElementById('viewerContainer') as HTMLElement).scrollTop = pack.scrollTop;
            (document.getElementById('viewerContainer') as HTMLElement).scrollLeft = pack.scrollLeft
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
    const viewerContainer = document.getElementById('viewerContainer')
    const viewer = document.getElementById('viewer')
    if (!viewerContainer || !viewer) {
        return maskArray
    }
    const pageCollection = viewer.getElementsByClassName('page') as HTMLCollectionOf<HTMLDivElement>
    if (!pageCollection) {
        return maskArray
    }
    for (const page of pageCollection) {
        const canvas = page.getElementsByTagName('canvas')[0]
        if (!canvas) {
            continue
        }
        debugPrint('canvas')
        debugPrint({ offsetTop: canvas.offsetTop, offetLeft: canvas.offsetLeft })
        debugPrint('page')
        debugPrint({ offsetTop: page.offsetTop, offetLeft: page.offsetLeft })
        const div = document.createElement('div')
        maskArray.push(div)
        div.style.padding = '0'
        div.style.margin = '0'
        div.style.border = 'none'
        div.style.outline = 'none'
        div.style.overflow = 'hidden'
        div.style.display = 'none'
        div.style.position = 'absolute'
        div.style.top = page.offsetTop + 'px'
        div.style.zIndex = '10'
        div.style.width = Math.min(viewer.clientWidth, page.clientWidth) + 'px'
        const img = new Image()
        img.src = canvas.toDataURL() ?? ''
        img.style.position = 'relative'
        if (isTrimEnabled()) {
            img.style.left = canvas.offsetLeft + 'px'
        } else {
            div.style.left = page.offsetLeft + 'px'
        }
        img.style.margin = '0'
        img.style.padding = '0'
        img.style.border = 'none'
        img.style.outline = 'none'
        img.style.width = canvas.clientWidth + 'px'
        img.style.height = canvas.clientHeight + 'px'
        div.appendChild(img)
        viewerContainer.appendChild(div)
        div.style.display = 'inherit'
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
