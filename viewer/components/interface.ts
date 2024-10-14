import type { ClientRequest, PanelRequest, PdfViewerState } from 'latex-toybox-protocol-types'
import type { SyncTex } from './synctex.js'
import type { ViewerHistory } from './viewerhistory.js'
import type { ViewerLoading } from './viewerloading.js'
import type { RenderingStates, ScrollMode, SpreadMode } from './constants.js'


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
    readonly viewport: {
        convertToViewportPoint(x: number, y: number): [number, number]
    },
    readonly canvas: HTMLCanvasElement | undefined,
    /** class="page" */
    readonly div: HTMLDivElement,
    getPagePoint(x: number, y: number): [number, number],
    get renderingState(): RenderingStates
}

interface IPDFViewer {
    currentScale: number,
    currentScaleValue: string,
    getPageView(index: number): IPageView | undefined,
    scrollMode: ScrollMode,
    spreadMode: SpreadMode,
    _getVisiblePages(): { first: number, last: number, views: { id: number, x: number, y: number, view: IPageView, percent: number }[], ids: Set<number> }
}

export interface IPDFViewerApplication {
    readonly eventBus: {
        on(eventName: PdfjsEventName, listener: () => void): void,
        off(eventName: PdfjsEventName, listener: () => void): void,
        dispatch(eventName: string): void
    },
    readonly findBar: {
        opened: boolean,
        open(): void
    },
    readonly initializedPromise: Promise<void>,
    readonly isViewerEmbedded: boolean,
    readonly pdfViewer: IPDFViewer,
    readonly pdfCursorTools: {
        _handTool: {
            activate(): void,
            deactivate(): void
        }
    },
    readonly pdfSidebar: {
        isOpen: boolean
    },
    readonly secondaryToolbar: {
        close(): void,
        isOpen: boolean
    },
    page: number,
    open(arg: { url: string }): Promise<void>
}

export interface IPDFViewerApplicationOptions {
    set(name: string, value: unknown): void,
    setAll(options: unknown): void
}
