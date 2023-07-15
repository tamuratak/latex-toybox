import { isEmbedded } from '../utils/utils.js'
import type { ILatexToyboxPdfViewer, IPDFViewerApplication } from './interface.js'
import { showToolbar } from './toolbar.js'

declare const PDFViewerApplication: IPDFViewerApplication


export class Keybinding {
    private readonly lwApp: ILatexToyboxPdfViewer

    constructor(lwApp: ILatexToyboxPdfViewer) {
        this.lwApp = lwApp
        this.registerKeybinding()
    }

    registerKeybinding() {
        if (isEmbedded) {
            document.addEventListener('click', (e) => {
                const target = e.target as HTMLAnchorElement
                if (target.nodeName === 'A' && !target.href.startsWith(window.location.href) && !target.href.startsWith('blob:')) { // is external link
                    this.lwApp.sendToPanelManager({ type: 'click_event', href: target.href })
                    e.preventDefault()
                }
            })
        }

        // keyboard bindings
        window.addEventListener('keydown', (evt) => {
            // F opens find bar, cause Ctrl-F is handled by vscode
            const target = evt.target as HTMLElement
            if(evt.keyCode === 70 && target.nodeName !== 'INPUT') { // ignore F typed in the search box
                showToolbar(false)
                PDFViewerApplication.findBar.open()
                evt.preventDefault()
            }

            // Chrome's usual Alt-Left/Right (Command-Left/Right on OSX) for history
            // Back/Forward don't work in the embedded viewer, so we simulate them.
            if (isEmbedded && (evt.altKey || evt.metaKey)) {
                if (evt.keyCode === 37) {
                    this.lwApp.viewerHistory.back()
                } else if(evt.keyCode === 39) {
                    this.lwApp.viewerHistory.forward()
                }
            }
        });

        (document.getElementById('outerContainer') as HTMLElement).onmousemove = (e) => {
            if (e.clientY <= 64) {
                showToolbar(true)
            }
        }
    }

}
