import * as http from 'node:http'
import type { AddressInfo } from 'node:net'
import ws from 'ws'
import * as path from 'node:path'
import * as vscode from 'vscode'

import { decodePathWithPrefix, pdfFilePrefix } from '../utils/encodepdffilepath.js'
import { readFileAsUint8Array } from '../lib/lwfs/lwfs.js'
import { ExternalPromise } from '../utils/externalpromise.js'
import type { Logger } from './logger.js'
import type { Viewer } from './viewer.js'
import { inspectCompact, inspectReadable } from '../utils/inspect.js'
import { instanceOfNodeError } from '../utils/utils.js'

class WsServer extends ws.Server {
    private readonly validOrigin: string

    constructor(
        server: http.Server,
        private readonly extension: {
            logger: Logger
        },
        validOrigin: string) {
        super({server})
        this.validOrigin = validOrigin
    }

    //
    // Check Origin header during WebSocket handshake.
    // - https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_servers#client_handshake_request
    // - https://github.com/websockets/ws/blob/master/doc/ws.md#servershouldhandlerequest
    //
    override shouldHandle(req: http.IncomingMessage): boolean {
        const reqOrigin = req.headers['origin']
        if (reqOrigin !== undefined && reqOrigin !== this.validOrigin) {
            this.extension.logger.info(`[Server] Origin in WebSocket upgrade request is invalid: ${inspectReadable(req.headers)}`)
            this.extension.logger.info(`[Server] Valid origin: ${this.validOrigin}`)
            return false
        } else {
            return true
        }
    }

}

interface CurrentSessionPort {
    sessionId: string
    port: number
}

export class Server {
    private readonly httpServer: http.Server
    private address?: AddressInfo
    private validOriginUri: vscode.Uri | undefined
    readonly #isReady = new ExternalPromise<void>()

    constructor(private readonly extension: {
        readonly extensionContext: vscode.ExtensionContext,
        readonly extensionRoot: string,
        readonly logger: Logger,
        readonly viewer: Viewer
    }) {
        this.httpServer = http.createServer((request, response) => this.handler(request, response))
        this.initializeHttpServer()

        extension.extensionContext.subscriptions.push(
            new vscode.Disposable(() => this.dispose())
        )

        this.extension.logger.info('[Server] Creating LaTeX Toybox http and websocket server.')
    }

    get isReady(): Promise<void> {
        return this.#isReady.promise
    }

    private dispose() {
        this.httpServer.close()
    }

    get port(): number {
        const portNum = this.address?.port
        if (portNum === undefined) {
            this.extension.logger.error('[Server] Server port number is undefined.')
            throw new Error('Server port number is undefined.')
        }
        return portNum
    }

    private get validOrigin(): string {
        if (this.validOriginUri) {
            return `${this.validOriginUri.scheme}://${this.validOriginUri.authority}`
        } else {
            throw new Error('[Server] validOriginUri is undefined')
        }
    }

    private initializeHttpServer() {
        const serverPortKey = 'server.port'
        const configuration = vscode.workspace.getConfiguration('latex-toybox')
        let viewerPort = configuration.get('view.pdf.port', 0)
        // Use the same port for the same session even if the extension host is reloaded.
        const currentSessionPort = this.extension.extensionContext.workspaceState.get<CurrentSessionPort>(serverPortKey)
        if (viewerPort === 0 && currentSessionPort) {
            const {sessionId, port} = currentSessionPort
            if (sessionId === vscode.env.sessionId) {
                this.extension.logger.info(`[Server] Restoring the server port of the current session: ${inspectCompact(currentSessionPort)}`)
                viewerPort = port
            }
        }
        this.httpServer.listen(viewerPort, '127.0.0.1', undefined, async () => {
            const address = this.httpServer.address()
            if (address && typeof address !== 'string') {
                this.address = address
                const curPort: CurrentSessionPort = {sessionId: vscode.env.sessionId, port: address.port}
                // Store the session id and the port number to use the same port for the same session even if the extension host is reloaded.
                await this.extension.extensionContext.workspaceState.update(serverPortKey, curPort)
                this.extension.logger.info(`[Server] Server successfully started: ${inspectCompact(address)}`)
                this.validOriginUri = await this.obtainValidOrigin(address.port)
                this.extension.logger.info(`[Server] validOrigin: ${this.validOrigin}`)
                this.initializeWsServer()
                this.#isReady.resolve()
            } else {
                this.extension.logger.error(`[Server] Server failed to start. Address is invalid: ${inspectCompact(address)}`)
                this.#isReady.reject(new Error(`Server failed to start. Address is invalid: ${inspectCompact(address)}`))
            }
        })
        this.httpServer.on('error', (err) => {
            this.extension.logger.error(`[Server] Error creating LaTeX Toybox http server: ${inspectReadable({viewerPort, err})}.`)
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
            websocket.on('error', (err) => this.extension.logger.error(`[Server] Error on WebSocket connection. ${inspectReadable(err)}`))
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
            this.extension.logger.info(`[Server] Origin in http request is invalid: ${inspectReadable(req.headers)}`)
            this.extension.logger.info(`[Server] validOrigin: ${this.validOrigin}`)
            response.writeHead(403)
            response.end()
            return false
        } else {
            return true
        }
    }

    private sendOkResponse(
        response: http.ServerResponse,
        content: string | Uint8Array,
        contentType: string,
        { isVeiewerHtml }: { isVeiewerHtml: boolean } = { isVeiewerHtml: false }
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
        // Extension host reload and window reload can occur simultaneously, such as during a VS Code update.
        // In this situation, the server may not yet be initialized, leading to the handler being invoked before the server is ready.
        // Consequently, we wait for the isReady promise to resolve before calling the handler body.
        await this.isReady
        if (!request.url) {
            return
        }
        const isValidOrigin = this.checkHttpOrigin(request, response)
        if (!isValidOrigin) {
            return
        }
        const requestUrl = new URL(request.url, this.validOrigin)
        const requestPath = requestUrl.pathname
        if (requestPath.startsWith('/' + pdfFilePrefix)) {
            const encodedFileUri = requestPath.replace('/', '')
            const fileUri = decodePathWithPrefix(encodedFileUri)
            if (this.extension.viewer.getClientSet(fileUri) === undefined) {
                this.extension.logger.error(`[Server] Invalid PDF request: ${fileUri.toString(true)}`)
                return
            }
            try {
                const buf = await readFileAsUint8Array(fileUri)
                this.sendOkResponse(response, buf, 'application/pdf')
                this.extension.logger.info(`[Server] Preview PDF file: ${fileUri.toString(true)}`)
            } catch (e) {
                this.extension.logger.error(`[Server] Error reading PDF file: ${fileUri.toString(true)}`)
                this.extension.logger.logError(e)
                response.writeHead(404)
                response.end()
            }
            return
        } else if (requestPath === '/config.json') {
            const params = this.extension.viewer.viewerParams()
            const content = JSON.stringify(params)
            this.sendOkResponse(response, content, 'application/json')
            return
        } else {
            //
            // Prevent directory traversal attack.
            // - https://en.wikipedia.org/wiki/Directory_traversal_attack
            //
            const reqPath = path.posix.resolve('/', requestPath)
            const extensionRootUri = this.extension.extensionContext.extensionUri
            let root: vscode.Uri
            // /viewer/**/*.ts are requested from sourcemaps.
            if (reqPath.startsWith('/out/viewer/') || reqPath.startsWith('/viewer/') || reqPath.startsWith('/node_modules/pdfjs-dist/')) {
                root = extensionRootUri
            } else {
                root = vscode.Uri.joinPath(extensionRootUri, '/viewer')
            }
            const fileName = vscode.Uri.joinPath(root, '.', reqPath)
            let contentType: string
            switch (path.extname(fileName.path)) {
                case '.html': {
                    contentType = 'text/html'
                    break
                }
                case '.mjs':
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
            try {
                const content = await readFileAsUint8Array(fileName)
                if (requestPath === '/viewer.html') {
                    this.sendOkResponse(response, content, contentType, { isVeiewerHtml: true })
                } else {
                    this.sendOkResponse(response, content, contentType)
                }
            } catch (err: unknown) {
                if (err instanceof vscode.FileSystemError || instanceOfNodeError(err, Error)) {
                    const code = err.code
                    if (code === 'FileNotFound' || code === 'ENOENT') {
                        response.writeHead(404)
                    } else {
                        response.writeHead(500)
                    }
                    response.end()
                } else {
                    throw err
                }
            }
        }
    }
}
