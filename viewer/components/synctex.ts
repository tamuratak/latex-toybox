import { viewerContainer, viewerElement, ScrollMode } from './constants.js'
import type { ILatexToyboxPdfViewer, IPDFViewerApplication } from './interface.js'
import { isTrimEnabled } from './pagetrimmer.js'

declare const PDFViewerApplication: IPDFViewerApplication


export class SyncTex {
    private readonly lwApp: ILatexToyboxPdfViewer
    reverseSynctexKeybinding = 'ctrl-click'

    constructor(lwApp: ILatexToyboxPdfViewer) {
        this.lwApp = lwApp
        // Since DOM of each page is recreated when a PDF document is reloaded,
        // we must register listeners every time.
        this.lwApp.lwEventBus.onPagesInit(() => {
            this.registerListenerOnEachPage()
        })
    }

    forwardSynctex(position: { page: number, x: number, y: number }) {
        if (!this.lwApp.synctexEnabled) {
            this.lwApp.addLogMessage('SyncTeX temporarily disabled.')
            return
        }
        // use the offsetTop of the actual page, much more accurate than multiplying the offsetHeight of the first page
        // https://github.com/James-Yu/LaTeX-Workshop/pull/417
        const pos = PDFViewerApplication.pdfViewer.getPageView(position.page - 1)?.viewport.convertToViewportPoint(position.x, position.y)
        if (!pos) {
            return
        }
        let page: HTMLElement
        if (PDFViewerApplication.pdfViewer.scrollMode === ScrollMode.PAGE) {
            page = document.getElementsByClassName('page')[0] as HTMLElement
        } else {
            page = document.getElementsByClassName('page')[position.page - 1] as HTMLElement
        }
        let scrollX = page.offsetLeft + pos[0]
        const scrollY = page.offsetTop + page.offsetHeight - pos[1]
        // set positions before and after SyncTeX to viewerHistory
        this.lwApp.viewerHistory.pushCurrentPositionToHistory()
        if (PDFViewerApplication.pdfViewer.scrollMode === ScrollMode.VERTICAL) {
            const maxScrollX = window.innerWidth * 0.9
            const minScrollX = window.innerWidth * 0.1
            scrollX = Math.min(scrollX, maxScrollX)
            scrollX = Math.max(scrollX, minScrollX)
            viewerContainer.scrollTop = scrollY - document.body.offsetHeight * 0.4
        } else if (PDFViewerApplication.pdfViewer.scrollMode === ScrollMode.HORIZONTAL) {
            viewerContainer.scrollLeft = page.offsetLeft
        } else if (PDFViewerApplication.pdfViewer.scrollMode === ScrollMode.PAGE) {
            PDFViewerApplication.page = position.page
        }
        this.lwApp.viewerHistory.pushCurrentPositionToHistory()

        const indicator = document.getElementById('synctex-indicator') as HTMLElement
        indicator.className = ''
        indicator.style.left = `${scrollX}px`
        indicator.style.top = `${scrollY}px`
        // We call requestAnimationFrame twice.
        // See https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_animations/Tips
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                indicator.className = 'pop'
            })
        })
    }

    private reverseSynctex(mouseEvent: MouseEvent, page: number, pageDom: HTMLElement) {
        const canvasDom = pageDom.getElementsByTagName('canvas')[0]
        if (!canvasDom) {
            throw new Error('Cannot find canvas element.')
        }
        const selection = window.getSelection()
        let textBeforeSelection = ''
        let textAfterSelection = ''
        // workaround for https://github.com/James-Yu/LaTeX-Workshop/issues/1314
        if (selection && selection.anchorNode && selection.anchorNode.nodeName === '#text') {
            const text = selection.anchorNode.textContent
            if (text) {
                textBeforeSelection = text.substring(0, selection.anchorOffset)
                textAfterSelection = text.substring(selection.anchorOffset)
            }
        }
        let left = mouseEvent.pageX - pageDom.offsetLeft + viewerContainer.scrollLeft
        const top = mouseEvent.pageY - pageDom.offsetTop + viewerContainer.scrollTop
        if (isTrimEnabled()) {
            const m = canvasDom.style.left.match(/-(.*)px/)
            const offsetLeft = m ? Number(m[1]) : 0
            left += offsetLeft
        }
        const pos = PDFViewerApplication.pdfViewer.getPageView(page - 1)?.getPagePoint(left, canvasDom.offsetHeight - top)
        if (!pos) {
            return
        }
        this.lwApp.send({ type: 'reverse_synctex', pdfFileUri: this.lwApp.pdfFileUri, pos, page, textBeforeSelection, textAfterSelection })
    }

    registerListenerOnEachPage() {
        const keybinding = this.reverseSynctexKeybinding
        for (const pageDom of viewerElement.childNodes as NodeListOf<HTMLElement>) {
            const page = Number(pageDom.dataset['pageNumber'])
            switch (keybinding) {
                case 'ctrl-click': {
                    pageDom.onclick = (e) => {
                        if (!(e.ctrlKey || e.metaKey)) {
                            return
                        }
                        this.reverseSynctex(e, page, pageDom)
                    }
                    break
                }
                case 'double-click': {
                    pageDom.ondblclick = (e) => {
                        this.reverseSynctex(e, page, pageDom)
                    }
                    break
                }
                default: {
                    console.log(`Unknown keybinding ${keybinding} (view.pdf.internal.synctex.keybinding)`)
                    break
                }
            }
        }
    }
}
