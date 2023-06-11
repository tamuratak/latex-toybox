import type { PdfViewerState } from '../../types/latex-workshop-protocol-types/index'
import { pdfFilePrefix } from '../utils/encodepdffilepath.js'
import type { ILatexWorkshopPdfViewer, IPDFViewerApplication, IPDFViewerApplicationOptions } from './interface.js'

declare const PDFViewerApplication: IPDFViewerApplication
declare const PDFViewerApplicationOptions: IPDFViewerApplicationOptions


export class ViewerLoading {
    private readonly lwApp: ILatexWorkshopPdfViewer

    constructor(lwApp: ILatexWorkshopPdfViewer) {
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

        void PDFViewerApplication.open({ url: `${pdfFilePrefix}${this.lwApp.encodedPdfFilePath}` }).then(() => {
            // reset the document title to the original value to avoid duplication
            document.title = this.lwApp.documentTitle
        })
        this.lwApp.lwEventBus.onPagesInit(() => {
            PDFViewerApplication.pdfViewer.currentScaleValue = pack.scale
            PDFViewerApplication.pdfViewer.scrollMode = pack.scrollMode
            PDFViewerApplication.pdfViewer.spreadMode = pack.spreadMode;
            (document.getElementById('viewerContainer') as HTMLElement).scrollTop = pack.scrollTop;
            (document.getElementById('viewerContainer') as HTMLElement).scrollLeft = pack.scrollLeft
        }, {once: true})
        // The height of each page can change after a `pagesinit` event.
        // We have to set scrollTop on a `pagesloaded` event for that case.
        this.lwApp.lwEventBus.onPagesLoaded(() => {
            (document.getElementById('viewerContainer') as HTMLElement).scrollTop = pack.scrollTop;
            (document.getElementById('viewerContainer') as HTMLElement).scrollLeft = pack.scrollLeft
        }, {once: true})
        this.lwApp.lwEventBus.onPagesLoaded(() => {
            this.lwApp.send({type:'loaded', pdfFileUri: this.lwApp.pdfFileUri})
        }, {once: true})
    }

}
