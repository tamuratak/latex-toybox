import type { ClientRequest, ServerResponse } from 'latex-toybox-protocol-types'
import { isEmbedded, sleep } from '../utils/utils.js'
import type { ILatexToyboxPdfViewer } from './interface.js'
import { ExternalPromise } from '../utils/externalpromise.js'


export class ExtensionConnection {
    private readonly lwApp: ILatexToyboxPdfViewer
    private connectionPort = new ConnectionPort()
    private readonly disconnectedNotificationDom = document.createElement('div')
    private readonly reconnectedNotificationDom = document.createElement('div')

    constructor(lwApp: ILatexToyboxPdfViewer) {
        this.lwApp = lwApp
        this.setupConnectionPort()
        this.setupDoms()
    }

    send(message: ClientRequest) {
        void this.connectionPort.send(message)
    }

    private setupDoms() {
        this.disconnectedNotificationDom.id = 'notify-disconnected'
        this.disconnectedNotificationDom.textContent = 'Disconnected from LaTeX Toybox. Trying to reconnect...'
        this.disconnectedNotificationDom.classList.add('hide')
        document.body.appendChild(this.disconnectedNotificationDom)
        this.reconnectedNotificationDom.id = 'notify-reconnected'
        this.reconnectedNotificationDom.textContent = 'Reconnected to LaTeX Toybox. Happy TeXing!'
        this.reconnectedNotificationDom.classList.add('hide')
        document.body.appendChild(this.reconnectedNotificationDom)
    }

    private notifyDisconnected() {
        this.disconnectedNotificationDom.classList.remove('hide')
    }

    private notifyReconnected() {
        this.disconnectedNotificationDom.classList.add('hide')
        this.reconnectedNotificationDom.classList.remove('hide')
        setTimeout(() => this.reconnectedNotificationDom.classList.add('hide'), 3000)
    }

    private setupConnectionPort() {
        const openPack: ClientRequest = {
            type: 'open',
            pdfFileUri: this.lwApp.pdfFileUri,
            viewer: (isEmbedded ? 'tab' : 'browser')
        }
        this.send(openPack)
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
                    this.notifyReconnected()
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
        /* eslint-disable-next-line @typescript-eslint/no-base-to-string */
        sock.addEventListener('error', (ev) => this.socketPromise.reject(new Error(`Failed to connect to ${server}: ${ev}`)) )
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
