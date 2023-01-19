import type { ILatexWorkshopPdfViewer, IPDFViewerApplication } from './interface.js'

declare const PDFViewerApplication: IPDFViewerApplication


export class VolatileConfig {
    private readonly lwApp: ILatexWorkshopPdfViewer

    #synctexEnabled = true
    #autoReloadEnabled = true

    constructor(lwApp: ILatexWorkshopPdfViewer) {
        this.lwApp = lwApp
        this.registerSynctexCheckBox()
        this.registerAutoReloadCheckBox()
    }

    get synctexEnabled() {
        return this.#synctexEnabled
    }

    get autoReloadEnabled() {
        return this.#autoReloadEnabled
    }

    setSynctex(flag: boolean) {
        const synctexOff = document.getElementById('synctexOff') as HTMLInputElement
        if (flag) {
            if (synctexOff.checked) {
                synctexOff.checked = false
            }
            this.#synctexEnabled = true
        } else {
            if (!synctexOff.checked) {
                synctexOff.checked = true
            }
            this.#synctexEnabled = false
        }
        this.lwApp.sendCurrentStateToPanelManager()
    }

    private registerSynctexCheckBox() {
        const synctexOff = document.getElementById('synctexOff') as HTMLInputElement
        synctexOff.addEventListener('change', () => {
            this.setSynctex(!synctexOff.checked)
            PDFViewerApplication.secondaryToolbar.close()
        })
        const synctexOffButton = document.getElementById('synctexOffButton') as HTMLButtonElement
        synctexOffButton.addEventListener('click', () => {
            this.setSynctex(!this.#synctexEnabled)
            PDFViewerApplication.secondaryToolbar.close()
        })
    }

    setAutoReload(flag: boolean) {
        const autoReloadOff = document.getElementById('autoReloadOff') as HTMLInputElement
        if (flag) {
            if (autoReloadOff.checked) {
                autoReloadOff.checked = false
            }
            this.#autoReloadEnabled = true
        } else {
            if (!autoReloadOff.checked) {
                autoReloadOff.checked = true
            }
            this.#autoReloadEnabled = false
        }
        this.lwApp.sendCurrentStateToPanelManager()
    }

    private registerAutoReloadCheckBox() {
        const autoReloadOff = document.getElementById('autoReloadOff') as HTMLInputElement
        autoReloadOff.addEventListener('change', () => {
            this.setAutoReload(!autoReloadOff.checked)
            PDFViewerApplication.secondaryToolbar.close()
        })
        const autoReloadOffButton = document.getElementById('autoReloadOffButton') as HTMLButtonElement
        autoReloadOffButton.addEventListener('click', () => {
            this.setAutoReload(!this.#autoReloadEnabled)
            PDFViewerApplication.secondaryToolbar.close()
        })
    }

}
