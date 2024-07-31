import type { IDisposable, ILwEventBus, IPDFViewerApplication } from './interface.js'

declare const PDFViewerApplication: IPDFViewerApplication


export class LwEventBus implements ILwEventBus {
    // The 'webviewerloaded' event is fired just before the initialization of PDF.js.
    // - https://github.com/mozilla/pdf.js/wiki/Third-party-viewer-usage#initialization-promise
    // - https://github.com/mozilla/pdf.js/pull/10318
    private readonly webViewerLoaded = new Promise<void>((resolve) => {
        document.addEventListener('webviewerloaded', () => resolve() )
    })

    // For the details of the initialization of PDF.js,
    // see https://github.com/mozilla/pdf.js/wiki/Third-party-viewer-usage
    // We should use only the promises provided by PDF.js here, not the ones defined by us,
    // to avoid deadlock.
    private async getEventBus() {
        await this.webViewerLoaded
        await PDFViewerApplication.initializedPromise
        return PDFViewerApplication.eventBus
    }

    onDidStartPdfViewer(cb: () => unknown): IDisposable {
        const documentLoadedEvent = 'documentloaded'
        const cb0 = () => {
            cb()
            PDFViewerApplication.eventBus.off(documentLoadedEvent, cb0)
        }
        void this.getEventBus().then(eventBus => {
            eventBus.on(documentLoadedEvent, cb0)
        })
        return { dispose: () => PDFViewerApplication.eventBus.off(documentLoadedEvent, cb0) }
    }

    onPagesInit(cb: () => unknown, option?: {once: boolean}): IDisposable {
        const pagesInitEvent = 'pagesinit'
        const cb0 = () => {
            cb()
            if (option?.once) {
                PDFViewerApplication.eventBus.off(pagesInitEvent, cb0)
            }
        }
        void this.getEventBus().then(eventBus => {
            eventBus.on(pagesInitEvent, cb0)
        })
        return { dispose: () => PDFViewerApplication.eventBus.off(pagesInitEvent, cb0) }
    }

    onPagesLoaded(cb: () => unknown, option?: {once: boolean}): IDisposable {
        const pagesLoadedEvent = 'pagesloaded'
        const cb0 = () => {
            cb()
            if (option?.once) {
                PDFViewerApplication.eventBus.off(pagesLoadedEvent, cb0)
            }
        }
        void this.getEventBus().then(eventBus => {
            eventBus.on(pagesLoadedEvent, cb0)
        })
        return { dispose: () => PDFViewerApplication.eventBus.off(pagesLoadedEvent, cb0) }
    }

    onPageRendered(cb: () => unknown, option?: {once: boolean}): IDisposable {
        const pageRenderedEvent = 'pagerendered'
        const cb0 = () => {
            cb()
            if (option?.once) {
                PDFViewerApplication.eventBus.off(pageRenderedEvent, cb0)
            }
        }
        void this.getEventBus().then(eventBus => {
            eventBus.on(pageRenderedEvent, cb0)
        })
        return { dispose: () => PDFViewerApplication.eventBus.off(pageRenderedEvent, cb0) }
    }
}
