import type {ILatexToyboxPdfViewer, IPDFViewerApplication} from './interface.js'

declare const PDFViewerApplication: IPDFViewerApplication


export class SyncTex {
    private readonly lwApp: ILatexToyboxPdfViewer
    reverseSynctexKeybinding: string = 'ctrl-click'

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
        const container = document.getElementById('viewerContainer') as HTMLElement
        const pos = PDFViewerApplication.pdfViewer.getPageView(position.page - 1).viewport.convertToViewportPoint(position.x, position.y)
        const page = document.getElementsByClassName('page')[position.page - 1] as HTMLElement
        const maxScrollX = window.innerWidth * 0.9
        const minScrollX = window.innerWidth * 0.1
        let scrollX = page.offsetLeft + pos[0]
        scrollX = Math.min(scrollX, maxScrollX)
        scrollX = Math.max(scrollX, minScrollX)
        const scrollY = page.offsetTop + page.offsetHeight - pos[1]

        // set positions before and after SyncTeX to viewerHistory
        this.lwApp.viewerHistory.pushCurrentPositionToHistory()
        if (PDFViewerApplication.pdfViewer.scrollMode === 1) {
            // horizontal scrolling
            container.scrollLeft = page.offsetLeft
        } else {
            // vertical scrolling
            container.scrollTop = scrollY - document.body.offsetHeight * 0.4
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

    private reverseSynctex(mouseEvent: MouseEvent, page: number, pageDom: HTMLElement, viewerContainer: HTMLElement) {
        const canvasDom = pageDom.getElementsByTagName('canvas')[0]
        if (!canvasDom) {
            throw new Error('Cannot find canvas element.')
        }
        const selection = window.getSelection()
        let textBeforeSelection = ''
        let textAfterSelection = ''
        // workaround for https://github.com/James-Yu/LaTeX-Workshop/issues/1314
        if(selection && selection.anchorNode && selection.anchorNode.nodeName === '#text'){
            const text = selection.anchorNode.textContent
            if (text) {
                textBeforeSelection = text.substring(0, selection.anchorOffset)
                textAfterSelection = text.substring(selection.anchorOffset)
            }
        }
        const trimSelect = document.getElementById('trimSelect') as HTMLSelectElement
        let left = mouseEvent.pageX - pageDom.offsetLeft + viewerContainer.scrollLeft
        const top = mouseEvent.pageY - pageDom.offsetTop + viewerContainer.scrollTop
        if (trimSelect.selectedIndex > 0) {
            const m = canvasDom.style.left.match(/-(.*)px/)
            const offsetLeft = m ? Number(m[1]) : 0
            left += offsetLeft
        }
        const pos = PDFViewerApplication.pdfViewer.getPageView(page-1).getPagePoint(left, canvasDom.offsetHeight - top)
        this.lwApp.send({type: 'reverse_synctex', pdfFileUri: this.lwApp.pdfFileUri, pos, page, textBeforeSelection, textAfterSelection})
    }

    registerListenerOnEachPage() {
        const keybinding = this.reverseSynctexKeybinding
        const viewerDom = document.getElementById('viewer') as HTMLElement
        for (const pageDom of viewerDom.childNodes as NodeListOf<HTMLElement>) {
            const page = Number(pageDom.dataset.pageNumber)
            const viewerContainer = document.getElementById('viewerContainer') as HTMLElement
            switch (keybinding) {
                case 'ctrl-click': {
                    pageDom.onclick = (e) => {
                        if (!(e.ctrlKey || e.metaKey)) {
                            return
                        }
                        this.reverseSynctex(e, page, pageDom, viewerContainer)
                    }
                    break
                }
                case 'double-click': {
                    pageDom.ondblclick = (e) => {
                        this.reverseSynctex(e, page, pageDom, viewerContainer)
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
