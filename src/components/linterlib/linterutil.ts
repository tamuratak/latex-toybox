import {ChildProcessWithoutNullStreams, spawn} from 'child_process'
import {EOL} from 'os'
import type { Logger } from '../logger'
import { ExternalPromise } from '../../utils/externalpromise'


export class LinterUtil {
    readonly #currentProcesses = Object.create(null) as { [linterId: string]: ChildProcessWithoutNullStreams }

    constructor(private readonly extension: {
        readonly logger: Logger
    }) { }

    processWrapper(linterId: string, command: string, args: string[], options: {cwd: string}, stdin?: string): Promise<string> {
        this.extension.logger.logCommand(`Linter for ${linterId} command`, command, args)
        if (this.#currentProcesses[linterId]) {
            this.#currentProcesses[linterId].kill()
        }

        const startTime = process.hrtime()
        this.#currentProcesses[linterId] = spawn(command, args, options)
        const proc = this.#currentProcesses[linterId]
        proc.stdout.setEncoding('binary')
        proc.stderr.setEncoding('binary')

        let stdout = ''
        proc.stdout.on('data', newStdout => {
            stdout += newStdout
        })

        let stderr = ''
        proc.stderr.on('data', newStderr => {
            stderr += newStderr
        })

        const resutlPromise = new ExternalPromise<string>()

        proc.on('error', err => {
            this.extension.logger.error(`Linter for ${linterId} failed to spawn command, encountering error: ${err.message}`)
            resutlPromise.reject(err)
        })

        proc.on('exit', exitCode => {
            if (exitCode !== 0) {
                let msg: string
                if (stderr === '') {
                    msg = stderr
                } else {
                    msg = '\n' + stderr
                }
                this.extension.logger.error(`Linter for ${linterId} failed with exit code ${exitCode} and error:${msg}`)
                resutlPromise.reject({ exitCode, stdout, stderr})
            } else {
                const [s, ms] = process.hrtime(startTime)
                this.extension.logger.info(`Linter for ${linterId} successfully finished in ${s}s ${Math.round(ms / 1000000)}ms`)
                resutlPromise.resolve(stdout)
            }
        })

        if (stdin !== undefined) {
            proc.stdin.write(stdin)
            if (!stdin.endsWith(EOL)) {
                // Always ensure we end with EOL otherwise ChkTeX will report line numbers as off by 1.
                proc.stdin.write(EOL)
            }
            proc.stdin.end()
        }

        return resutlPromise.promise
    }

}
