import type {ILatexWorkshopPdfViewer} from './interface.js'

// Static HTML elements
const viewerContainerElement = document.getElementById('viewerContainer') as HTMLElement
const sidebarContainerElement = document.getElementById('sidebarContainer') as HTMLElement
const historyBackElement = document.getElementById('historyBack') as HTMLElement
const historyForwardElement = document.getElementById('historyForward') as HTMLElement


type HistoryEntry = {
    readonly scroll: number
}

export class ViewerHistory {
    private history: HistoryEntry[] = []
    /**
     * Index, at which a previous position is stored. When the Back button is clicked,
     * the viewer scrolls to the position.
     */
    private currentPrevIndex: number | 'historyIsEmpty' = 'historyIsEmpty'
    private readonly lwApp: ILatexWorkshopPdfViewer
    /**
     * The scroll position when the Back button is clicked newly.
     */
    private scrollPositionWhenGoingBack: number | undefined

    constructor(lwApp: ILatexWorkshopPdfViewer) {
        this.lwApp = lwApp
        this.registerKeybinding()
    }

    private registerKeybinding() {
        const setHistory = () => {
            // set positions before and after clicking to viewerHistory
            this.lwApp.viewerHistory.pushCurrentPositionToHistory()
            setTimeout(() => {this.lwApp.viewerHistory.pushCurrentPositionToHistory()}, 500)
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
        const scroll = viewerContainerElement.scrollTop
        if (this.history.length === 0) {
            this.history.push({scroll})
            this.currentPrevIndex = 0
            return
        }

        if (this.currentPrevIndex === 'historyIsEmpty') {
            console.log('this.currentIndex === historyIsEmpty never happens here.')
            return
        }

        const curScroll = this.history[this.currentPrevIndex].scroll
        if (curScroll !== scroll) {
            this.history = this.history.slice(0, this.currentPrevIndex + 1)
            this.history.push({scroll})
            if (this.length() > 30) {
                this.history = this.history.slice(this.length() - 30)
            }
            this.currentPrevIndex = this.lastIndex()
        }
    }

    back() {
        if (this.length() === 0) {
            return
        }
        const cur = this.currentPrevIndex
        if (cur === 'historyIsEmpty') {
            return
        }
        const prevScroll = this.history[cur].scroll
        if (this.currentPrevIndex === this.lastIndex() && prevScroll !== viewerContainerElement.scrollTop) {
            // We have to store the current scroll position, because
            // the viewer should go back to it when users click the last Forward button.
            this.scrollPositionWhenGoingBack = viewerContainerElement.scrollTop
        }
        if (prevScroll !== viewerContainerElement.scrollTop) {
            viewerContainerElement.scrollTop = prevScroll
        } else {
            if (cur <= 0) {
                return
            }
            const newIndex = cur - 1
            const scrl = this.history[newIndex].scroll
            this.currentPrevIndex = newIndex
            viewerContainerElement.scrollTop = scrl
        }
    }

    forward() {
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
        const nextScroll = this.history[newIndex].scroll
        if (nextScroll !== viewerContainerElement.scrollTop) {
            this.currentPrevIndex = newIndex
            viewerContainerElement.scrollTop = nextScroll
        } else {
            newIndex = cur + 2
            if (newIndex >= this.history.length) {
                return
            }
            const scrl = this.history[newIndex].scroll
            this.currentPrevIndex = newIndex
            viewerContainerElement.scrollTop = scrl
        }
    }

}
