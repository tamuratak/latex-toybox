import * as vscode from 'vscode'
import * as path from 'node:path'
import * as workerpool from 'workerpool'
import type { Proxy } from 'workerpool'
import type { IMathJaxWorker } from './mathjaxpool_worker.js'
import type { SupportedExtension } from 'mathjax-full'
import { isRunningOnWebWorker } from '../../utils/web.js'


const supportedExtensionList = [
    'amscd',
    'bbox',
    'boldsymbol',
    'braket',
    'bussproofs',
    'cancel',
    'cases',
    'centernot',
    'colortbl',
    'empheq',
    'enclose',
    'extpfeil',
    'gensymb',
    'html',
    'mathtools',
    'mhchem',
    'physics',
    'textcomp',
    'textmacros',
    'unicode',
    'upgreek',
    'verb'
]

export class MathJaxPool {
    private readonly pool: workerpool.WorkerPool
    private readonly proxyPromise: workerpool.Promise<Proxy<IMathJaxWorker>>

    constructor() {
        if (isRunningOnWebWorker()) {
            // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
            const mathjaxPoolWorkerDataUrl = require('inline-worker:./mathjaxpool_worker.js') as string
            this.pool = workerpool.pool(
                mathjaxPoolWorkerDataUrl,
                { minWorkers: 1, maxWorkers: 1, workerType: 'web' }
            )
            throw new Error('MathJaxPool cannot be used in a web worker.')
        } else {
            this.pool = workerpool.pool(
                path.join(__dirname, 'mathjaxpool_worker.js'),
                { minWorkers: 1, maxWorkers: 1, workerType: 'thread' }
            )
        }
        this.proxyPromise = this.pool.proxy<IMathJaxWorker>()
        void this.initializeExtensions()
    }

    async dispose() {
        await this.pool.terminate(true)
    }

    private initializeExtensions() {
        void this.loadExtensions()
        vscode.workspace.onDidChangeConfiguration(async (ev) => {
            if (ev.affectsConfiguration('latex-toybox.hover.preview.mathjax.extensions')) {
                return this.loadExtensions()
            }
        })
    }

    async typeset(arg: string, opts: { scale: number, color: string }): Promise<string> {
        const proxy = await this.proxyPromise
        const svgHtml = await proxy.typeset(arg, opts).timeout(3000)
        return svgHtml
    }

    private async loadExtensions() {
        const configuration = vscode.workspace.getConfiguration('latex-toybox')
        const extensions = configuration.get('hover.preview.mathjax.extensions', []) as SupportedExtension[]
        const extensionsToLoad = extensions.filter((ex) => supportedExtensionList.includes(ex))
        const proxy = await this.proxyPromise
        return proxy.loadExtensions(extensionsToLoad)
    }

}
