import type { PanelManagerResponse, PanelRequest, PdfViewerState } from 'latex-toybox-protocol-types'
import { ExternalPromise } from '../utils/externalpromise.js'
import { isTrustedOrigin } from '../utils/origin.js'
import { isEmbedded, isPdfjsShortcut } from '../utils/utils.js'
import type { ILatexToyboxPdfViewer, IPDFViewerApplication, PdfjsEventName } from './interface.js'

declare const PDFViewerApplication: IPDFViewerApplication


export class PanelManagerConnection {
    private readonly lwApp: ILatexToyboxPdfViewer
    readonly #restoredState = new ExternalPromise<PdfViewerState | undefined>()

    constructor(lwApp: ILatexToyboxPdfViewer) {
        this.lwApp = lwApp
        void this.startReceivingPanelManagerResponse()
        void this.startRebroadcastingKeyboardEvent()
        void this.startSendingState()
    }

    get restoredState() {
        return this.#restoredState.promise
    }

    send(msg: PanelRequest) {
        if (!isEmbedded) {
            return
        }
        window.parent?.postMessage(msg, '*')
    }

    private async startReceivingPanelManagerResponse() {
        await this.lwApp.pdfViewerStarted
        window.addEventListener('message', (e) => {
            if (!isTrustedOrigin(e.origin)) {
                console.log('LatexToyboxPdfViewer received a message with invalid origin')
                return
            }
            const data = e.data as PanelManagerResponse
            if (!data.type) {
                console.log('LatexToyboxPdfViewer received a message of unknown type')
                return
            }
            switch (data.type) {
                case 'restore_state': {
                    if (data.state.kind !== 'not_stored') {
                        this.#restoredState.resolve(data.state)
                    } else {
                        this.#restoredState.resolve(undefined)
                    }
                    break
                }
                case 'copy_event': {
                    const text = document.getSelection()?.toString()
                    if (text) {
                        this.send({ type: 'copy_event', text })
                    }
                    break
                }
                case 'paste_event': {
                    const active = document.activeElement
                    if (active?.tagName === 'INPUT') {
                        const inputElement = active as HTMLInputElement
                        if (inputElement.value === '') {
                            inputElement.value = data.text
                        }
                    }
                    break
                }
                default: {
                    break
                }
            }
        })
        /**
         * Since this.pdfViewerStarted is resolved, the PDF viewer has started.
         */
        this.send({type: 'initialized'})
    }

    // To enable keyboard shortcuts of VS Code when the iframe is focused,
    // we have to dispatch keyboard events in the parent window.
    // See https://github.com/microsoft/vscode/issues/65452#issuecomment-586036474
    private startRebroadcastingKeyboardEvent() {
        if (!isEmbedded) {
            return
        }
        document.addEventListener('keydown', e => {
            const obj = {
                altKey: e.altKey,
                code: e.code,
                keyCode: e.keyCode,
                ctrlKey: e.ctrlKey,
                isComposing: e.isComposing,
                key: e.key,
                location: e.location,
                metaKey: e.metaKey,
                repeat: e.repeat,
                shiftKey: e.shiftKey
            }
            if (isPdfjsShortcut(obj)) {
                return
            }
            this.send({
                type: 'keyboard_event',
                event: obj
            })
        })
    }

    sendCurrentState() {
        const pack = this.lwApp.getPdfViewerState()
        this.send({type: 'state', state: pack})
    }

    private async startSendingState() {
        await this.lwApp.pdfViewerStarted
        if (!isEmbedded) {
            return
        }
        window.addEventListener('scroll', () => {
            this.sendCurrentState()
        }, true)
        const events: PdfjsEventName[] = ['scroll', 'scalechanged', 'zoomin', 'zoomout', 'zoomreset', 'scrollmodechanged', 'spreadmodechanged', 'pagenumberchanged']
        for (const ev of events) {
            PDFViewerApplication.eventBus.on(ev, () => {
                this.sendCurrentState()
            })
        }
    }

}
