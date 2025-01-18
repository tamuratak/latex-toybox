import type { ClientRequest, ServerResponse } from 'latex-toybox-protocol-types'
import { isEmbedded, sleep } from '../utils/utils.js'
import type { ILatexToyboxPdfViewer } from './interface.js'
import { ExternalPromise } from '../utils/externalpromise.js'


export class ExtensionConnection {
    private readonly lwApp: ILatexToyboxPdfViewer
    private connectionPort = new ConnectionPort()
    private disconnectedNotificationDom: HTMLDivElement | undefined

    constructor(lwApp: ILatexToyboxPdfViewer) {
        this.lwApp = lwApp
        this.setupConnectionPort()
    }

    send(message: ClientRequest) {
        return this.connectionPort.send(message)
    }

    private notifyDisconnected() {
        if (this.disconnectedNotificationDom) {
            return
        }
        const dom = document.createElement('div')
        dom.id = 'notify-disconnected'
        dom.textContent = 'Disconnected from LaTeX Toybox. Trying to reconnect...'
        this.disconnectedNotificationDom = dom
        document.body.appendChild(dom)
    }

    private async notifyReconnected() {
        this.disconnectedNotificationDom?.remove()
        this.disconnectedNotificationDom = undefined
        const dom = document.createElement('div')
        dom.id = 'notify-reconnected'
        dom.textContent = 'Reconnected to LaTeX Toybox. Happy TeXing!'
        document.body.appendChild(dom)
        await sleep(3000)
        dom.classList.add('hide')
        await sleep(1000)
        dom.remove()
    }

    private setupConnectionPort() {
        const openPack: ClientRequest = {
            type: 'open',
            pdfFileUri: this.lwApp.pdfFileUri,
            viewer: (isEmbedded ? 'tab' : 'browser')
        }
        void this.send(openPack)
        void this.connectionPort.onDidReceiveMessage((event: MessageEvent<string>) => {
            const data = JSON.parse(event.data) as ServerResponse
            switch (data.type) {
                case 'synctex': {
                    this.lwApp.synctex.forwardSynctex(data.data)
                    break
                }
                case 'refresh': {
                    this.lwApp.viewerLoading.refreshPDFViewer()
                    break
                }
                default: {
                    data satisfies never
                    break
                }
            }
        })

        void this.connectionPort.onDidClose(async () => {
            this.notifyDisconnected()
            console.log('Closed: WebScocket to LaTeX Toybox.')

            // Since WebSockets are disconnected when PC resumes from sleep,
            // we have to reconnect. https://github.com/James-Yu/LaTeX-Workshop/pull/1812
            for (let i = 0; i < 10; i++) {
                await sleep(3000)
                console.log('Try to reconnect to LaTeX Toybox.')
                try {
                    this.connectionPort = new ConnectionPort()
                    await this.connectionPort.readyPromise
                    void this.notifyReconnected()
                    this.setupConnectionPort()
                    console.log('Reconnected: WebScocket to LaTeX Toybox.')
                    return
                } catch (e) {
                    console.log('Failed to reconnect to LaTeX Toybox.')
                    console.log(e)
                }
            }
            console.log('Failed to reconnect to LaTeX Toybox after 10 attempts. Giving up.')
        })
    }

}

class ConnectionPort {
    private readonly socketPromise = new ExternalPromise<WebSocket>

    constructor() {
        const scheme = 'https:' === window.location.protocol ? 'wss' : 'ws'
        const server = `${scheme}://${window.location.hostname}:${window.location.port}`
        const sock = new WebSocket(server)
        sock.addEventListener('open', () => this.socketPromise.resolve(sock) )
        sock.addEventListener('error', (ev) => {
            console.error(`Failed to connect to ${server}: `, ev)
            this.socketPromise.reject(new Error(`Failed to connect to ${server}`))
        })
        this.startConnectionKeeper()
    }

    get readyPromise() {
        return this.socketPromise.promise.then(() => undefined)
    }

    private startConnectionKeeper() {
        // Send packets every 30 sec to prevent the connection closed by timeout.
        setInterval(() => {
            void this.send({type: 'ping'})
        }, 30000)
    }

    async send(message: ClientRequest) {
        const sock = await this.socketPromise.promise
        if (sock.readyState === 1) {
            sock.send(JSON.stringify(message))
        }
    }

    async onDidReceiveMessage(cb: (event: WebSocketEventMap['message']) => void) {
        const sock = await this.socketPromise.promise
        sock.addEventListener('message', cb)
    }

    async onDidClose(cb: () => unknown) {
        const sock = await this.socketPromise.promise
        sock.addEventListener('close', () => cb())
    }

    async onDidOpen(cb: () => unknown) {
        await this.socketPromise.promise
        cb()
    }

}
