import {ExtensionConnection} from './components/extensionconnection.js'
import {SyncTex} from './components/synctex.js'
import {PageTrimmer} from './components/pagetrimmer.js'
import * as utils from './utils/utils.js'
import { isEmbedded } from './utils/utils.js'
import {ViewerHistory} from './components/viewerhistory.js'

import type {ILatexWorkshopPdfViewer, IPDFViewerApplication} from './components/interface.js'
import type {ClientRequest, PdfViewerState, PanelRequest} from '../types/latex-workshop-protocol-types/index'
import { AppConfig } from './components/appconfig.js'
import { Keybinding } from './components/keybinding.js'
import { ViewerLoading } from './components/viewerloading.js'
import { LwEventBus } from './components/lweventbus.js'
import { PanelManagerConnection } from './components/panelmanagerconnection.js'
import { VolatileConfig } from './components/volatileconfig.js'
import { hidePrintButton, setCssRuleForToolbar } from './components/toolbar.js'

declare const PDFViewerApplication: IPDFViewerApplication


class LateXWorkshopPdfViewer implements ILatexWorkshopPdfViewer {
    readonly documentTitle: string = ''
    readonly encodedPdfFilePath: string
    readonly pdfFileUri: string

    readonly pageTrimmer: PageTrimmer
    readonly synctex: SyncTex
    readonly viewerHistory: ViewerHistory
    readonly appConfig: AppConfig
    readonly keybinding: Keybinding
    readonly viewerLoading: ViewerLoading
    readonly lwEventBus: LwEventBus
    readonly volatileConfig: VolatileConfig

    private readonly panelManagerConnection: PanelManagerConnection
    private readonly extensionConnection: ExtensionConnection

    readonly pdfViewerStarted: Promise<void>
    pdfPagesLoaded: Promise<void>

    constructor() {
        this.lwEventBus = new LwEventBus()

        // When the promise is resolved, the initialization
        // of LateXWorkshopPdfViewer and PDF.js is completed.
        this.pdfViewerStarted = new Promise((resolve) => {
            this.lwEventBus.onDidStartPdfViewer(() => resolve())
        })

        const pack = utils.decodeQuery()
        this.encodedPdfFilePath = pack.encodedPdfFilePath
        this.documentTitle = pack.documentTitle || ''
        document.title = this.documentTitle
        this.pdfFileUri = pack.pdfFileUri

        this.viewerHistory = new ViewerHistory(this)
        this.synctex = new SyncTex(this)
        this.pageTrimmer = new PageTrimmer(this)
        this.appConfig = new AppConfig(this)
        this.keybinding = new Keybinding(this)
        this.viewerLoading = new ViewerLoading(this)
        this.volatileConfig = new VolatileConfig(this)
        this.panelManagerConnection = new PanelManagerConnection(this)
        this.extensionConnection = new ExtensionConnection(this)

        this.lwEventBus.onPagesLoaded(() => {
            this.send({type:'loaded', pdfFileUri: this.pdfFileUri})
        }, {once: true})

        hidePrintButton()

        this.pdfPagesLoaded = new Promise((resolve) => {
            this.lwEventBus.onPagesLoaded(() => resolve(), {once: true})
        })
        this.lwEventBus.onPagesInit(() => {
            this.pdfPagesLoaded = new Promise((resolve) => {
                this.lwEventBus.onPagesLoaded(() => resolve(), {once: true})
            })
        })

        void this.appConfig.setupAppOptions()
        void this.applyParamsOnStart()
    }

    send(message: ClientRequest) {
        void this.extensionConnection.send(message)
    }

    sendToPanelManager(msg: PanelRequest) {
        this.panelManagerConnection.send(msg)
    }

    addLogMessage(message: string) {
        this.send({type: 'add_log', message})
    }

    getPdfViewerState(): PdfViewerState {
        const pack: PdfViewerState = {
            pdfFileUri: this.pdfFileUri,
            scale: this.pageTrimmer.originalPdfViewerCurrentScaleValue || PDFViewerApplication.pdfViewer.currentScaleValue,
            scrollMode: PDFViewerApplication.pdfViewer.scrollMode,
            spreadMode: PDFViewerApplication.pdfViewer.spreadMode,
            scrollTop: (document.getElementById('viewerContainer') as HTMLElement).scrollTop,
            scrollLeft: (document.getElementById('viewerContainer') as HTMLElement).scrollLeft,
            trim: (document.getElementById('trimSelect') as HTMLSelectElement).selectedIndex,
            synctexEnabled: this.synctexEnabled,
            autoReloadEnabled: this.autoReloadEnabled
        }
        return pack
    }

    private get restoredState() {
        if (isEmbedded) {
            return this.panelManagerConnection.restoredState
        } else {
            return undefined
        }
    }

    async waitSetupAppOptionsReady() {
        return this.appConfig.waitSetupAppOptionsReady()
    }

    private async applyParamsOnStart() {
        await this.pdfViewerStarted
        const params = await this.appConfig.paramsPromise
        this.appConfig.applyNonStatefulParams(params)
        const restoredState = await this.restoredState
        if (restoredState) {
            await this.viewerLoading.restorePdfViewerState(restoredState)
        } else {
            await this.viewerLoading.restorePdfViewerState(params)
        }
        setCssRuleForToolbar()
    }

    get synctexEnabled() {
        return this.volatileConfig.synctexEnabled
    }

    get autoReloadEnabled() {
        return this.volatileConfig.autoReloadEnabled
    }

    setSynctex(flag: boolean) {
        this.volatileConfig.setSynctex(flag)
    }

    setAutoReload(flag: boolean) {
        this.volatileConfig.setAutoReload(flag)
    }

    sendCurrentStateToPanelManager() {
        this.panelManagerConnection.sendCurrentState()
    }

}

// Defines pdfjsLib globally.
// @ts-expect-error
await import('/build/pdf.js')

const extension = new LateXWorkshopPdfViewer()
await extension.waitSetupAppOptionsReady()

// Defines PDFViewerApplication, PDFViewerApplicationOptions, and PDFViewerApplicationConstants globally.
// @ts-expect-error
await import('/viewer.js')
