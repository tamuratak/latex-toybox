import type { ClientRequest, PanelRequest, PdfViewerState } from 'latex-toybox-protocol-types'
import type { SyncTex } from './synctex.js'
import type { ViewerHistory } from './viewerhistory.js'
import type { ViewerLoading } from './viewerloading.js'
import { RenderingStates, ScrollMode, SpreadMode } from './enums.js'


export interface IDisposable {
    dispose(): unknown
}

export interface ILatexToyboxPdfViewer {
    readonly documentTitle: string,
    readonly encodedPdfFilePath: string,
    readonly pdfFileUri: string,
    readonly synctex: SyncTex,
    readonly viewerHistory: ViewerHistory,
    readonly viewerLoading: ViewerLoading,
    readonly lwEventBus: ILwEventBus,
    readonly synctexEnabled: boolean,
    readonly autoReloadEnabled: boolean,
    readonly pdfViewerStarted: Promise<void>,
    readonly pdfPagesLoaded: Promise<void>,

    send(message: ClientRequest): void,
    sendToPanelManager(msg: PanelRequest): void,
    sendCurrentStateToPanelManager(): void,
    addLogMessage(message: string): void,
    setSynctex(flag: boolean): void,
    setAutoReload(flag: boolean): void,
    getPdfViewerState(): PdfViewerState
}

export interface ILwEventBus {
    onDidStartPdfViewer(cb: () => unknown): IDisposable,
    onPagesInit(cb: () => unknown, option?: {once: boolean}): IDisposable,
    onPagesLoaded(cb: () => unknown, option?: {once: boolean}): IDisposable,
    onPageRendered(cb: () => unknown, option?: {once: boolean}): IDisposable
}

export type PdfjsEventName
    = 'documentloaded'
    | 'pagesinit'
    | 'pagesloaded'
    | 'scroll'
    | 'scalechanged'
    | 'zoomin'
    | 'zoomout'
    | 'zoomreset'
    | 'scrollmodechanged'
    | 'spreadmodechanged'
    | 'pagechanging'
    | 'pagerendered'

interface IPageView {
    viewport: {
        convertToViewportPoint(x: number, y: number): [number, number]
    },
    getPagePoint(x: number, y: number): [number, number],
    get renderingState(): RenderingStates
}

interface IPDFViewer {
    currentScale: number,
    currentScaleValue: string,
    getPageView(index: number): IPageView,
    getCachedPageViews(): Set<IPageView>,
    scrollMode: ScrollMode,
    spreadMode: SpreadMode
}

export interface IPDFViewerApplication {
    eventBus: {
        on: (eventName: PdfjsEventName, listener: () => void) => void,
        off: (eventName: PdfjsEventName, listener: () => void) => void,
        dispatch: (eventName: string) => void
    },
    findBar: {
        opened: boolean,
        open(): void
    },
    initializedPromise: Promise<void>,
    isViewerEmbedded: boolean,
    page: number,
    pdfViewer: IPDFViewer,
    pdfCursorTools: {
        _handTool: {
            activate(): void,
            deactivate(): void
        }
    },
    pdfSidebar: {
        isOpen: boolean
    },
    secondaryToolbar: {
        close: () => void,
        isOpen: boolean
    },
    open(arg: { url: string }): Promise<void>
}

export interface IPDFViewerApplicationOptions {
    set(name: string, value: unknown): void,
    setAll(options: unknown): void
}
