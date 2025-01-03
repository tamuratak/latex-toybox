import * as vscode from 'vscode'
import * as cs from 'cross-spawn'
import type { Logger } from './logger.js'
import type { Manager } from './manager.js'
import { ExternalPromise } from '../utils/externalpromise.js'
import { decodeUtf8 } from '../utils/utf8.js'


export class TeXDoc {

    constructor(private readonly extension: {
        readonly logger: Logger,
        readonly manager: Manager
    }) { }

    private runTexdoc(pkg: string) {
        const configuration = vscode.workspace.getConfiguration('latex-toybox')
        const texdocPath = configuration.get('texdoc.path') as string
        const texdocArgs = Array.from(configuration.get('texdoc.args') as string[])
        texdocArgs.push(pkg)
        this.extension.logger.logCommand('Run texdoc command', texdocPath, texdocArgs)
        const proc = cs.spawn(texdocPath, texdocArgs)

        let stdout = ''
        proc.stdout.on('data', (newStdout: Uint8Array) => {
            stdout += decodeUtf8(newStdout)
        })

        let stderr = ''
        proc.stderr.on('data', (newStderr: Uint8Array) => {
            stderr += decodeUtf8(newStderr)
        })

        const resultPromise = new ExternalPromise<void>()

        proc.on('error', err => {
            this.extension.logger.error(`Cannot run texdoc: ${err.message}, ${stderr}`)
            resultPromise.reject(err)
        })

        proc.on('exit', exitCode => {
            if (exitCode !== 0) {
                this.extension.logger.error(`Cannot find documentation for ${pkg}.`)
            } else {
                const regex = new RegExp(`(no documentation found)|(Documentation for ${pkg} could not be found)`)
                if (stdout.match(regex) || stderr.match(regex)) {
                    this.extension.logger.error(`Cannot find documentation for ${pkg}.`)
                } else {
                    this.extension.logger.info(`Opening documentation for ${pkg}.`)
                }
            }
            this.extension.logger.info(`texdoc stdout: ${stdout}`)
            this.extension.logger.info(`texdoc stderr: ${stderr}`)
            resultPromise.resolve()
        })

        return resultPromise.promise
    }

    texdoc(pkg?: string) {
        if (pkg) {
            return this.runTexdoc(pkg)
        }
        void vscode.window.showInputBox({value: '', prompt: 'Package name'}).then(selectedPkg => {
            if (!selectedPkg) {
                return
            }
            return this.runTexdoc(selectedPkg)
        })
        return
    }

    texdocUsepackages() {
        const names = new Set<string>()
        for (const tex of this.extension.manager.getIncludedTeX()) {
            const content = this.extension.manager.getCachedContent(tex)
            const pkgs = content && content.element.package
            pkgs?.forEach(pkg => names.add(pkg))
        }
        const packagenames = Array.from(new Set(names))
        const items: vscode.QuickPickItem[] = packagenames.map( name => {
            return { label: name }
        })
        void vscode.window.showQuickPick(items).then(selectedPkg => {
            if (!selectedPkg) {
                return
            }
            return this.runTexdoc(selectedPkg.label)
        })
    }
}
