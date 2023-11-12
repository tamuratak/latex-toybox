import type { PdfViewerParams } from 'latex-toybox-protocol-types'
import type { ILatexToyboxPdfViewer, IPDFViewerApplication, IPDFViewerApplicationOptions } from './interface.js'
import { ExternalPromise } from '../utils/externalpromise.js'
import { isPrefersColorSchemeDark } from '../utils/utils.js'

declare const PDFViewerApplication: IPDFViewerApplication
declare const PDFViewerApplicationOptions: IPDFViewerApplicationOptions


export class AppConfig {
    readonly #setupAppOptionsPromise = new ExternalPromise<void>()
    readonly #paramsPromise = new ExternalPromise<PdfViewerParams>()
    private readonly lwApp: ILatexToyboxPdfViewer

    constructor(lwApp: ILatexToyboxPdfViewer) {
        this.lwApp = lwApp
        void this.fetchParams().then(params => this.#paramsPromise.resolve(params))
        void this.setupAppOptions()
    }

    get paramsPromise() {
        return this.#paramsPromise.promise
    }

    async waitSetupAppOptionsReady() {
        return this.#setupAppOptionsPromise.promise
    }

    private async fetchParams(): Promise<PdfViewerParams> {
        const response = await fetch('/config.json')
        const params = await response.json() as PdfViewerParams
        return params
    }

    async setupAppOptions() {
        const workerPort = new Worker('/build/pdf.worker.mjs', { type: 'module' })
        const params = await this.paramsPromise
        const color = isPrefersColorSchemeDark() ? params.color.dark : params.color.light
        const options = {
            annotationEditorMode: -1,
            disablePreferences: true,
            enableScripting: false,
            cMapUrl: '/cmaps/',
            sidebarViewOnLoad: 0,
            standardFontDataUrl: '/standard_fonts/',
            workerPort,
            workerSrc: '/build/pdf.worker.mjs',
            forcePageColors: true,
            ...color
        }
        // The 'webviewerloaded' event is fired just before the initialization of PDF.js.
        // We can set PDFViewerApplicationOptions at the time.
        // - https://github.com/mozilla/pdf.js/wiki/Third-party-viewer-usage#initialization-promise
        // - https://github.com/mozilla/pdf.js/pull/10318
        document.addEventListener('webviewerloaded', () => PDFViewerApplicationOptions.setAll(options))
        this.#setupAppOptionsPromise.resolve()
    }

    applyNonStatefulParams(params: PdfViewerParams) {
        if (params.hand) {
            PDFViewerApplication.pdfCursorTools._handTool.activate()
        } else {
            PDFViewerApplication.pdfCursorTools._handTool.deactivate()
        }
        if (params.invertMode.enabled) {
            const { brightness, grayscale, hueRotate, invert, sepia } = params.invertMode
            const filter = `invert(${invert * 100}%) hue-rotate(${hueRotate}deg) grayscale(${grayscale}) sepia(${sepia}) brightness(${brightness})`
            if (isPrefersColorSchemeDark()) {
                (document.querySelector('#viewerContainer') as HTMLHtmlElement).style.filter = filter;
                (document.querySelector('#thumbnailView') as HTMLHtmlElement).style.filter = filter;
                (document.querySelector('#sidebarContent') as HTMLHtmlElement).style.background = 'var(--body-bg-color)'
            } else {
                (document.querySelector('html') as HTMLHtmlElement).style.filter = filter;
                (document.querySelector('html') as HTMLHtmlElement).style.background = 'white'
            }
        }
        if (isPrefersColorSchemeDark()) {
            (document.querySelector('#viewerContainer') as HTMLElement).style.background = params.color.dark.backgroundColor
        } else {
            (document.querySelector('#viewerContainer') as HTMLElement).style.background = params.color.light.backgroundColor
        }

        if (params.keybindings) {
            this.lwApp.synctex.reverseSynctexKeybinding = params.keybindings['synctex']
            this.lwApp.synctex.registerListenerOnEachPage()
        }
    }

}
