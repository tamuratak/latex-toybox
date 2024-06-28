import { debugPrint } from '../utils/debug.js'
import { ScrollMode } from './enums.js'
import type { ILatexToyboxPdfViewer, IPDFViewerApplication } from './interface.js'

declare const PDFViewerApplication: IPDFViewerApplication

// Static HTML elements
const viewerContainerElement = document.getElementById('viewerContainer') as HTMLElement
const sidebarContainerElement = document.getElementById('sidebarContainer') as HTMLElement
const historyBackElement = document.getElementById('historyBack') as HTMLElement
const historyForwardElement = document.getElementById('historyForward') as HTMLElement

type HistoryEntry = {
    readonly scroll: number,
    readonly page: number,
    readonly scrollMode: ScrollMode
}

function isEntryEqual(a: HistoryEntry, b: HistoryEntry) {
    if (a.scrollMode === b.scrollMode) {
        if (a.scrollMode === ScrollMode.PAGE) {
            return a.page === b.page
        } else {
            return a.scroll === b.scroll
        }
    } else {
        return a.page === b.page
    }
}

function getCurrentPosition(): HistoryEntry {
    const page = PDFViewerApplication.page
    const scrollMode = PDFViewerApplication.pdfViewer.scrollMode
    if (PDFViewerApplication.pdfViewer.scrollMode === ScrollMode.VERTICAL) {
        const scroll = viewerContainerElement.scrollTop
        return { scroll, page, scrollMode }
    } else if (PDFViewerApplication.pdfViewer.scrollMode === ScrollMode.HORIZONTAL) {
        const scroll = viewerContainerElement.scrollLeft
        return { scroll, page, scrollMode }
    } else {
        return { scroll: 0, page, scrollMode }
    }
}

function setScroll(entry: HistoryEntry) {
    if (PDFViewerApplication.pdfViewer.scrollMode === entry.scrollMode) {
        if (PDFViewerApplication.pdfViewer.scrollMode === ScrollMode.VERTICAL) {
            viewerContainerElement.scrollTop = entry.scroll
        } else if (PDFViewerApplication.pdfViewer.scrollMode === ScrollMode.HORIZONTAL) {
            viewerContainerElement.scrollLeft = entry.scroll
        } else {
            PDFViewerApplication.page = entry.page
        }
    } else {
        PDFViewerApplication.page = entry.page
    }
}


export class ViewerHistory {
    private history: HistoryEntry[] = []
    /**
     * Index, at which a previous position is stored. When the Back button is clicked,
     * the viewer scrolls to the position.
     */
    private currentPrevIndex: number | 'historyIsEmpty' = 'historyIsEmpty'
    private readonly lwApp: ILatexToyboxPdfViewer
    /**
     * The scroll position when the Back button is clicked newly.
     */
    private scrollPositionWhenGoingBack: number | undefined

    constructor(lwApp: ILatexToyboxPdfViewer) {
        this.lwApp = lwApp
        this.registerKeybinding()
    }

    private registerKeybinding() {
        const setHistory = () => {
            // set positions before and after clicking to viewerHistory
            this.lwApp.viewerHistory.pushCurrentPositionToHistory()
            setTimeout(() => { this.lwApp.viewerHistory.pushCurrentPositionToHistory() }, 500)
        }

        viewerContainerElement.addEventListener('click', setHistory)
        sidebarContainerElement.addEventListener('click', setHistory)

        // back button (mostly useful for the embedded viewer)
        historyBackElement.addEventListener('click', () => {
            this.lwApp.viewerHistory.back()
        })

        historyForwardElement.addEventListener('click', () => {
            this.lwApp.viewerHistory.forward()
        })
    }

    private historyAt(index: number) {
        const result = this.history[index]
        if (result === undefined) {
            throw new Error(`historyAt: result is undefined. index: ${index}, history.length: ${this.history.length}`)
        }
        return result
    }

    private lastIndex() {
        if (this.history.length === 0) {
            return 'historyIsEmpty'
        } else {
            return this.history.length - 1
        }
    }

    private length() {
        return this.history.length
    }

    pushCurrentPositionToHistory() {
        this.scrollPositionWhenGoingBack = undefined
        const entry = getCurrentPosition()
        if (this.history.length === 0) {
            this.history.push(entry)
            this.currentPrevIndex = 0
            return
        } else if (this.currentPrevIndex === 'historyIsEmpty') {
            console.log('this.currentIndex === historyIsEmpty never happens here.')
            return
        } else {
            const curEntry = this.historyAt(this.currentPrevIndex)
            if (!isEntryEqual(curEntry, entry)) {
                this.history = this.history.slice(0, this.currentPrevIndex + 1)
                this.history.push(entry)
                if (this.length() > 30) {
                    this.history = this.history.slice(this.length() - 30)
                }
                this.currentPrevIndex = this.lastIndex()
            }
        }
    }

    back() {
        debugPrint(this.history)
        if (this.length() === 0) {
            return
        }
        const cur = this.currentPrevIndex
        if (cur === 'historyIsEmpty') {
            return
        }
        const prevHistory = this.historyAt(cur)
        const prevScroll = prevHistory.scroll
        if (this.currentPrevIndex === this.lastIndex() && prevScroll !== viewerContainerElement.scrollTop) {
            // We have to store the current scroll position, because
            // the viewer should go back to it when users click the last Forward button.
            this.scrollPositionWhenGoingBack = viewerContainerElement.scrollTop
        }
        if (!isEntryEqual(prevHistory, getCurrentPosition())) {
            setScroll(prevHistory)
        } else {
            if (cur <= 0) {
                return
            }
            const newIndex = cur - 1
            const entry = this.historyAt(newIndex)
            this.currentPrevIndex = newIndex
            setScroll(entry)
        }
    }

    forward() {
        debugPrint(this.history)
        if (this.currentPrevIndex === this.lastIndex()) {
            if (this.scrollPositionWhenGoingBack !== undefined) {
                viewerContainerElement.scrollTop = this.scrollPositionWhenGoingBack
                this.scrollPositionWhenGoingBack = undefined
            }
            return
        }
        const cur = this.currentPrevIndex
        if (cur === 'historyIsEmpty') {
            return
        }
        let newIndex = cur + 1
        const nextEntry = this.historyAt(newIndex)
        if (!isEntryEqual(nextEntry, getCurrentPosition())) {
            this.currentPrevIndex = newIndex
            setScroll(nextEntry)
        } else {
            newIndex = cur + 2
            if (newIndex >= this.history.length) {
                return
            }
            const entry = this.historyAt(newIndex)
            this.currentPrevIndex = newIndex
            setScroll(entry)
        }
    }

}
