import * as http from 'http'
import type {AddressInfo} from 'net'
import ws from 'ws'
import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'

import type {Extension} from '../main'
import {decodePathWithPrefix, pdfFilePrefix} from '../utils/encodepdffilepath'
import { readFileAsBuffer } from '../lib/lwfs/lwfs'
import type { IServer } from '../interfaces'
import { ExternalPromise } from '../utils/externalpromise'

class WsServer extends ws.Server {
    private readonly extension: Extension
    private readonly validOrigin: string

    constructor(server: http.Server, extension: Extension, validOrigin: string) {
        super({server})
        this.extension = extension
        this.validOrigin = validOrigin
    }

    //
    // Check Origin header during WebSocket handshake.
    // - https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_servers#client_handshake_request
    // - https://github.com/websockets/ws/blob/master/doc/ws.md#servershouldhandlerequest
    //
    shouldHandle(req: http.IncomingMessage): boolean {
        const reqOrigin = req.headers['origin']
        if (reqOrigin !== undefined && reqOrigin !== this.validOrigin) {
            this.extension.logger.info(`[Server] Origin in WebSocket upgrade request is invalid: ${JSON.stringify(req.headers)}`)
            this.extension.logger.info(`[Server] Valid origin: ${this.validOrigin}`)
            return false
        } else {
            return true
        }
    }

}

export class Server implements IServer {
    private readonly extension: Extension
    private readonly httpServer: http.Server
    private address?: AddressInfo
    private validOriginUri: vscode.Uri | undefined
    readonly #serverStarted = new ExternalPromise<void>()

    constructor(extension: Extension) {
        this.extension = extension
        this.httpServer = http.createServer((request, response) => this.handler(request, response))
        this.initializeHttpServer()

        extension.extensionContext.subscriptions.push(
            new vscode.Disposable(() => this.dispose())
        )

        this.extension.logger.info('[Server] Creating LaTeX Workshop http and websocket server.')
    }

    get serverStarted(): Promise<void> {
        return this.#serverStarted.promise
    }

    private dispose() {
        this.httpServer.close()
    }

    get port(): number {
        const portNum = this.address?.port
        if (portNum === undefined) {
            this.extension.logger.info('Server port number is undefined.')
            throw new Error('Server port number is undefined.')
        }
        return portNum
    }

    private get validOrigin(): string {
        if (this.validOriginUri) {
            return `${this.validOriginUri.scheme}://${this.validOriginUri.authority}`
        } else {
            throw new Error('[Server] validOrigin is undefined')
        }
    }

    private initializeHttpServer() {
        const configuration = vscode.workspace.getConfiguration('latex-workshop')
        const viewerPort = configuration.get('viewer.pdf.internal.port') as number
        this.httpServer.listen(viewerPort, '127.0.0.1', undefined, async () => {
            const address = this.httpServer.address()
            if (address && typeof address !== 'string') {
                this.address = address
                this.extension.logger.info(`[Server] Server successfully started: ${JSON.stringify(address)}`)
                this.validOriginUri = await this.obtainValidOrigin(address.port)
                this.extension.logger.info(`[Server] valdOrigin is ${this.validOrigin}`)
                this.initializeWsServer()
                this.#serverStarted.resolve()
            } else {
                this.extension.logger.info(`[Server] Server failed to start. Address is invalid: ${JSON.stringify(address)}`)
            }
        })
        this.httpServer.on('error', (err) => {
            this.extension.logger.error(`[Server] Error creating LaTeX Workshop http server: ${JSON.stringify(err)}.`)
        })
    }

    private async obtainValidOrigin(serverPort: number): Promise<vscode.Uri> {
        const origUrl = `http://127.0.0.1:${serverPort}/`
        const uri = await vscode.env.asExternalUri(vscode.Uri.parse(origUrl, true))
        return uri
    }

    private initializeWsServer() {
        const wsServer = new WsServer(this.httpServer, this.extension, this.validOrigin)
        wsServer.on('connection', (websocket) => {
            websocket.on('message', (msg: string) => this.extension.viewer.handler(websocket, msg))
            websocket.on('error', (err) => this.extension.logger.error(`[Server] Error on WebSocket connection. ${JSON.stringify(err)}`))
        })
    }

    //
    // We reject cross-origin requests. The specification says "In case a server does not wish to participate in the CORS protocol,
    // ... The server is encouraged to use the 403 status in such HTTP responses."
    // - https://fetch.spec.whatwg.org/#http-requests
    // - https://fetch.spec.whatwg.org/#http-responses
    //
    private checkHttpOrigin(req: http.IncomingMessage, response: http.ServerResponse): boolean {
        const reqOrigin = req.headers['origin']
        if (reqOrigin !== undefined && reqOrigin !== this.validOrigin) {
            this.extension.logger.info(`[Server] Origin in http request is invalid: ${JSON.stringify(req.headers)}`)
            this.extension.logger.info(`[Server] Valid origin: ${this.validOrigin}`)
            response.writeHead(403)
            response.end()
            return false
        } else {
            return true
        }
    }

    private sendOkResponse(
        response: http.ServerResponse,
        content: Buffer,
        contentType: string,
        isVeiewerHtml: boolean = false
    ) {
        //
        // Headers to enable site isolation.
        // - https://fetch.spec.whatwg.org/#cross-origin-resource-policy-header
        // - https://www.w3.org/TR/post-spectre-webdev/#documents-isolated
        //
        const sameOriginPolicyHeaders = {
            'Cross-Origin-Resource-Policy': isVeiewerHtml ? 'cross-origin' : 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp',
            'Cross-Origin-Opener-Policy': 'same-origin',
            'X-Content-Type-Options': 'nosniff'
        }
        response.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': content.length,
            ...sameOriginPolicyHeaders
        })
        response.end(content)
    }

    private async handler(request: http.IncomingMessage, response: http.ServerResponse) {
        if (!request.url) {
            return
        }
        const isValidOrigin = this.checkHttpOrigin(request, response)
        if (!isValidOrigin) {
            return
        }
        if (request.url.startsWith('/' + pdfFilePrefix)) {
            const encodedFileUri = request.url.replace('/', '')
            const fileUri = decodePathWithPrefix(encodedFileUri)
            if (this.extension.viewer.getClientSet(fileUri) === undefined) {
                this.extension.logger.info(`Invalid PDF request: ${fileUri.toString(true)}`)
                return
            }
            try {
                const buf: Buffer = await readFileAsBuffer(fileUri)
                this.sendOkResponse(response, buf, 'application/pdf')
                this.extension.logger.info(`Preview PDF file: ${fileUri.toString(true)}`)
            } catch (e) {
                this.extension.logger.error(`Error reading PDF file: ${fileUri.toString(true)}`)
                if (e instanceof Error) {
                    this.extension.logger.logError(e)
                }
                response.writeHead(404)
                response.end()
            }
            return
        } else if (request.url === '/config.json') {
            const params = this.extension.viewer.viewerParams()
            const content = JSON.stringify(params)
            this.sendOkResponse(response, Buffer.from(content), 'application/json')
            return
        } else {
            let root: string
            if (request.url.startsWith('/build/') || request.url.startsWith('/cmaps/') || request.url.startsWith('/standard_fonts/')) {
                root = path.resolve(`${this.extension.extensionRoot}/node_modules/pdfjs-dist`)
            } else if (request.url.startsWith('/out/viewer/') || request.url.startsWith('/viewer/')) {
                // For requests to /out/viewer/*.js and requests to /viewer/*.ts.
                // The latter is for debugging with sourcemap.
                root = path.resolve(this.extension.extensionRoot)
            } else {
                root = path.resolve(`${this.extension.extensionRoot}/viewer`)
            }
            //
            // Prevent directory traversal attack.
            // - https://en.wikipedia.org/wiki/Directory_traversal_attack
            //
            const reqFileName = path.posix.resolve('/', request.url.split('?')[0])
            const fileName = path.resolve(root, '.' + reqFileName)
            let contentType: string
            switch (path.extname(fileName)) {
                case '.html': {
                    contentType = 'text/html'
                    break
                }
                case '.js': {
                    contentType = 'text/javascript'
                    break
                }
                case '.css': {
                    contentType = 'text/css'
                    break
                }
                case '.json': {
                    contentType = 'application/json'
                    break
                }
                case '.png': {
                    contentType = 'image/png'
                    break
                }
                case '.jpg': {
                    contentType = 'image/jpg'
                    break
                }
                case '.gif': {
                    contentType = 'image/gif'
                    break
                }
                case '.svg': {
                    contentType = 'image/svg+xml'
                    break
                }
                case '.ico': {
                    contentType = 'image/x-icon'
                    break
                }
                default: {
                    contentType = 'application/octet-stream'
                    break
                }
            }
            fs.readFile(fileName, (err, content) => {
                if (err) {
                    if (err.code === 'ENOENT') {
                        response.writeHead(404)
                    } else {
                        response.writeHead(500)
                    }
                    response.end()
                } else {
                    if (request.url?.startsWith('/viewer.html')) {
                        this.sendOkResponse(response, content, contentType, true)
                    } else {
                        this.sendOkResponse(response, content, contentType)
                    }
                }
            })
        }
    }
}
