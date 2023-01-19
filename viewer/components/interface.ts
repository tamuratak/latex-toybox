import type {ClientRequest, PanelRequest, PdfViewerState} from '../../types/latex-workshop-protocol-types/index'
import type {SyncTex} from './synctex.js'
import type {ViewerHistory} from './viewerhistory.js'
import type { ViewerLoading } from './viewerloading.js'


export interface IDisposable {
    dispose(): unknown
}

export interface ILatexWorkshopPdfViewer {
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
    onPagesLoaded(cb: () => unknown, option?: {once: boolean}): IDisposable
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
    | 'pagenumberchanged'

type PageView = {
    viewport: {
        convertToViewportPoint(x: number, y: number): [number, number]
    },
    getPagePoint(x: number, y: number): [number, number]
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
    pdfViewer: {
        currentScale: number,
        currentScaleValue: string,
        getPageView: (index: number) => PageView,
        scrollMode: number,
        spreadMode: number
    },
    pdfCursorTools: {
        handTool: {
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
    open(filePath: string): Promise<void>
}

export interface IPDFViewerApplicationOptions {
    set(name: string, value: unknown): void,
    setAll(options: unknown): void
}
