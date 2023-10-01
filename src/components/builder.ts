import * as vscode from 'vscode'
import * as path from 'path'
import * as cp from 'child_process'
import * as cs from 'cross-spawn'
import {replaceArgumentPlaceholders} from '../utils/utils'

import { MaxWaitingLimitError, MutexWithSizedQueue } from '../utils/mutexwithsizedqueue'
import type { EventBus } from './eventbus'
import type { Logger } from './logger'
import type { CompilerLog } from './compilerlog'
import type { Manager } from './manager'
import type { LwStatusBarItem } from './statusbaritem'
import { statPath } from '../lib/lwfs/lwfs'
import { ExternalPromise } from '../utils/externalpromise'
import { inspectCompact } from '../utils/inspect'

const maxPrintLine = '10000'

interface ProcessEnv {
    [key: string]: string | undefined
}

export interface StepCommand {
    readonly name: string,
    readonly command: string,
    readonly args: readonly string[] | undefined,
    readonly env?: ProcessEnv
}

interface Recipe {
    readonly name: string,
    readonly tools: readonly string[]
}

export class Builder {
    private currentProcess: cp.ChildProcessWithoutNullStreams | undefined
    private readonly buildMutex = new MutexWithSizedQueue(1)
    private previouslyUsedRecipe: Recipe | undefined
    private previousLanguageId: string | undefined

    constructor(private readonly extension: {
        readonly eventBus: EventBus,
        readonly logger: Logger,
        readonly compilerLog: CompilerLog,
        readonly manager: Manager,
        readonly statusbaritem: LwStatusBarItem
    }) { }

    /**
     * Kill the current building process.
     */
    kill() {
        const proc = this.currentProcess
        if (proc) {
            const pid = proc.pid
            try {
                this.extension.logger.info(`Kill child processes of the current process. PPID: ${pid}`)
                if (process.platform === 'linux' || process.platform === 'darwin') {
                    cp.execSync(`pkill -P ${pid}`, { timeout: 1000 })
                } else if (process.platform === 'win32') {
                    cp.execSync(`taskkill /F /T /PID ${pid}`, { timeout: 1000 })
                }
            } catch (e) {
                if (e instanceof Error) {
                    this.extension.logger.error(`Error when killing child processes of the current process. ${e.message}`)
                }
            } finally {
                proc.kill()
                this.extension.logger.info(`Kill the current process. PID: ${pid}`)
            }
        } else {
            this.extension.logger.info('LaTeX build process to kill is not found.')
        }
    }

    private isWaitingForBuildToFinish(): boolean {
        return this.buildMutex.waiting > 0
    }

    private async preprocess(): Promise<() => void> {
        await vscode.workspace.saveAll()
        try {
            const releaseBuildMutex = await this.buildMutex.acquire()
            return releaseBuildMutex
        } catch (e) {
            if (e instanceof MaxWaitingLimitError) {
                const msg = 'Another LaTeX build processing is already waiting for the current LaTeX build to finish. Exit.'
                this.extension.logger.info(msg)
            }
            throw e
        }
    }

    /**
     * Execute a command building LaTeX files.
     *
     * @param command The name of the command to build LaTeX files.
     * @param args The arguments of the command.
     * @param pwd The path of the working directory of building.
     * @param rootFile The root file to be compiled.
     */
    async buildWithExternalCommand(command: string, args: string[], pwd: string, rootFile: string | undefined = undefined) {
        const releaseBuildMutex = await this.preprocess()
        try {
            await this.buildWithExternalCommandImpl(command, args, pwd, rootFile)
            await this.buildFinished(rootFile)
        } finally {
            releaseBuildMutex()
        }
    }

    private async buildWithExternalCommandImpl(command: string, args: string[], pwd: string, rootFile: string | undefined = undefined) {
        if (rootFile) {
            // Stop watching the PDF file to avoid reloading the PDF viewer twice.
            // The builder will be responsible for refreshing the viewer.
            this.extension.manager.ignorePdfFile(rootFile)
        }
        this.extension.statusbaritem.displayStatus('ongoing')
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
        const wd = workspaceFolder?.uri.fsPath || pwd

        if (rootFile !== undefined) {
            args = args.map(replaceArgumentPlaceholders(rootFile))
        }
        this.extension.logger.logCommand('Build using external command', command, args)
        this.extension.logger.info(`cwd: ${wd}`)
        this.currentProcess = cs.spawn(command, args, {cwd: wd})
        const pid = this.currentProcess.pid
        this.extension.logger.info(`External build process spawned. PID: ${pid}.`)

        const stepLog = this.extension.compilerLog.createStepLog(rootFile, {name: 'external', command, args}, {stepIndex: 1, totalStepsLength: 1})
        this.currentProcess.stdout.on('data', (newStdout: Buffer | string) => {
            stepLog.append(newStdout.toString())
        })

        this.currentProcess.stderr.on('data', (newStderr: Buffer | string) => {
            stepLog.appendError(newStderr.toString())
        })

        const resultPromise = new ExternalPromise<void>()

        this.currentProcess.on('error', err => {
            this.extension.logger.error(`Build fatal error: ${err.message}, ${stepLog.stderr}. PID: ${pid}. Does the executable exist?`)
            this.extension.statusbaritem.displayStatus('fail', 'Build failed.')
            this.currentProcess = undefined
            resultPromise.reject(err)
        })

        this.currentProcess.on('exit', (exitCode, signal) => {
            void this.extension.compilerLog.parse(stepLog)
            if (exitCode !== 0) {
                this.extension.logger.error(`Build returns with error: ${exitCode}/${signal}. PID: ${pid}.`)
                this.extension.statusbaritem.displayStatus('fail', 'Build failed.')
                this.currentProcess = undefined
                resultPromise.reject({exitCode, signal, pid})
            } else {
                this.extension.logger.info(`Successfully built. PID: ${pid}`)
                this.extension.statusbaritem.displayStatus('success', 'Build succeeded.')
                this.currentProcess = undefined
                resultPromise.resolve()
            }
        })

        return resultPromise.promise
    }

    /**
     * Build a LaTeX file with user-defined recipes.
     *
     * @param rootFile The root file to be compiled.
     * @param languageId The name of the language of a file to be compiled.
     * @param recipeName The name of a recipe to be used.
     */
    async build(rootFile: string, languageId: string, recipeName: string | undefined = undefined) {
        // Stop watching the PDF file to avoid reloading the PDF viewer twice.
        // The builder will be responsible for refreshing the viewer.
        this.extension.manager.ignorePdfFile(rootFile)
        if (this.isWaitingForBuildToFinish()) {
            this.extension.logger.info('Another LaTeX build processing is already waiting for the current LaTeX build to finish. Exit.')
            return
        }
        const releaseBuildMutex = await this.preprocess()
        this.extension.statusbaritem.displayStatus('ongoing')
        this.extension.logger.info(`Build root file ${rootFile}`)
        try {
            // Create sub directories of output directory
            const rootDir = path.dirname(rootFile)
            let outDir = this.extension.manager.getOutDir(rootFile)
            if (!path.isAbsolute(outDir)) {
                outDir = path.resolve(rootDir, outDir)
            }
            this.extension.logger.info(`outDir: ${outDir}`)
            for (const file of this.extension.manager.getIncludedTeX(rootFile)) {
                const relativePath = path.dirname(file.replace(rootDir, '.'))
                const fullOutDir = path.resolve(outDir, relativePath)
                const fullOutDirType = await statPath(fullOutDir).catch(() => undefined)
                if (!fullOutDirType) {
                    // We create the directory only in the workspace.
                    await vscode.workspace.fs.createDirectory(vscode.Uri.file(fullOutDir))
                } else {
                    if (fullOutDirType.type !== vscode.FileType.Directory) {
                        const msg = `outDir is not directory: ${fullOutDir}`
                        this.extension.logger.error(msg)
                        throw new Error(msg)
                    }
                }
            }
            await this.buildInitiator(rootFile, languageId, recipeName)
            await this.buildFinished(rootFile)
        } catch (e) {
            this.extension.statusbaritem.displayStatus('fail', 'Build failed.')
            if (e instanceof Error) {
                this.extension.logger.logError(e)
            }
        } finally {
            releaseBuildMutex()
        }
    }

    private async buildInitiator(rootFile: string, languageId: string, recipeName: string | undefined = undefined) {
        const steps = this.createSteps(rootFile, languageId, recipeName)
        if (steps === undefined) {
            const message = `Cannot create steps: ${rootFile}, ${languageId}, ${recipeName}`
            this.extension.logger.error(message)
            throw new Error(message)
        }
        this.extension.compilerLog.clear()
        const totalStepsLength = steps.length
        for(let index = 0; index < steps.length; index++) {
            const step = steps[index]
            const stepIndex = index + 1
            const processString = this.progressString(recipeName || 'Build', step, {stepIndex, totalStepsLength})
            this.extension.statusbaritem.displayStatus('ongoing', '', processString)
            await this.buildStep(rootFile, step, {stepIndex, totalStepsLength})
        }
        this.extension.logger.info(`Recipe of length ${steps.length} finished.`)
    }

    private progressString(recipeName: string, step: StepCommand, {stepIndex, totalStepsLength}: {stepIndex: number, totalStepsLength: number}) {
        if (totalStepsLength < 2) {
            return recipeName
        } else {
            return ' ' + recipeName + `: ${stepIndex}/${totalStepsLength} (${step.name})`
        }
    }

    private buildStep(rootFile: string, step: StepCommand, {stepIndex, totalStepsLength}: {stepIndex: number, totalStepsLength: number}) {
        this.extension.logger.logCommand(`Recipe step ${stepIndex}`, step.command, step.args)
        this.extension.logger.info(`Recipe step env: ${inspectCompact(step.env)}`)
        const envVars = Object.create(null) as ProcessEnv
        Object.keys(process.env).forEach(key => envVars[key] = process.env[key])
        const currentEnv = step.env
        if (currentEnv) {
            Object.keys(currentEnv).forEach(key => envVars[key] = currentEnv[key])
        }
        // We log $Path too since `Object.keys(process.env)` includes Path, not PATH on Windows.
        const envVarsPATH = envVars['PATH']
        const envVarsPath = envVars['Path']
        envVars['max_print_line'] = maxPrintLine
        let workingDirectory: string
        if (step.command === 'latexmk' && rootFile === this.extension.manager.localRootFile && this.extension.manager.rootDir) {
            workingDirectory = this.extension.manager.rootDir
        } else {
            workingDirectory = path.dirname(rootFile)
        }
        this.extension.logger.info(`cwd: ${workingDirectory}`)
        this.currentProcess = cs.spawn(step.command, step.args, {cwd: workingDirectory, env: envVars})
        const pid = this.currentProcess.pid
        this.extension.logger.info(`LaTeX build process spawned. PID: ${pid}.`)

        const stepLog = this.extension.compilerLog.createStepLog(rootFile, step, {stepIndex, totalStepsLength})

        this.currentProcess.stdout.on('data', (newStdout: Buffer | string) => {
            stepLog.append(newStdout.toString())
        })

        this.currentProcess.stderr.on('data', (newStderr: Buffer | string) => {
            stepLog.appendError(newStderr.toString())
        })

        const resultPromise = new ExternalPromise<void>()

        this.currentProcess.on('error', err => {
            this.extension.logger.error(`LaTeX fatal error: ${err.message}, ${stepLog.stderr}. PID: ${pid}.`)
            this.extension.logger.error(`Does the executable exist? $PATH: ${envVarsPATH}`)
            this.extension.logger.error(`Does the executable exist? $Path: ${envVarsPath}`)
            this.extension.logger.error(`The environment variable $SHELL: ${process.env.SHELL}`)
            this.extension.statusbaritem.displayStatus('fail', 'Build failed.')
            this.currentProcess = undefined
            resultPromise.reject(err)
        })

        this.currentProcess.on('exit', (exitCode, signal) => {
            try {
                void this.extension.compilerLog.parse(stepLog, rootFile)
                if (exitCode !== 0) {
                    this.extension.logger.error(`Recipe returns with error: ${exitCode}/${signal}. PID: ${pid}. message: ${stepLog.stderr}.`)
                    this.extension.logger.error(`The environment variable $PATH: ${envVarsPATH}`)
                    this.extension.logger.error(`The environment variable $Path: ${envVarsPath}`)
                    this.extension.logger.error(`The environment variable $SHELL: ${process.env.SHELL}`)
                    this.extension.statusbaritem.displayStatus('fail', 'Build failed.')
                    this.currentProcess = undefined
                    resultPromise.reject({exitCode, signal, pid})
                } else {
                    this.extension.logger.info(`A step in recipe finished. PID: ${pid}.`)
                    this.currentProcess = undefined
                    resultPromise.resolve()
                }
            } catch(e) {
                resultPromise.reject(e)
            }
        })

        return resultPromise.promise
    }

    private async buildFinished(rootFile: string | undefined) {
        this.extension.logger.info(`Successfully built ${rootFile}.`)
        this.extension.statusbaritem.displayStatus('success', 'Recipe succeeded.')
        if (this.extension.compilerLog.isLaTeXmkSkipped) {
            return
        }
        await this.extension.eventBus.buildFinished.fire(rootFile)
    }

    private createSteps(rootFile: string, languageId: string, recipeName: string | undefined): StepCommand[] | undefined {
        const steps: StepCommand[] = []
        const configuration = vscode.workspace.getConfiguration('latex-toybox', vscode.Uri.file(rootFile))

        const recipes = configuration.get('latex.recipes', []) as Recipe[]
        const defaultRecipeName: string = configuration.get('latex.recipe.default', 'first')
        const toolDefs = configuration.get('latex.tools', []) as StepCommand[]
        if (recipes.length < 1) {
            this.extension.logger.error('No recipes defined.')
            return
        }
        let recipe: Recipe | undefined = undefined
        if (this.previousLanguageId !== languageId) {
            this.previouslyUsedRecipe = undefined
        }
        if (!recipeName && !['first', 'lastUsed'].includes(defaultRecipeName)) {
            recipeName = defaultRecipeName
        }
        if (recipeName) {
            recipe = recipes.find(recipeDef => recipeDef.name === recipeName)
        } else if (defaultRecipeName === 'lastUsed' && this.previouslyUsedRecipe) {
            recipe = this.previouslyUsedRecipe
        } else if (defaultRecipeName === 'first' || defaultRecipeName === 'lastUsed' && !this.previouslyUsedRecipe) {
            recipe = recipes[0]
        }
        if (recipe === undefined) {
            this.extension.logger.error(`Failed to resolve build recipe: ${[recipeName, defaultRecipeName]}`)
            return
        }
        this.previouslyUsedRecipe = recipe
        this.previousLanguageId = languageId

        for (const toolName of recipe.tools) {
            const candidate = toolDefs.find(toolDef => toolDef.name === toolName)
            if (candidate) {
                steps.push(candidate)
            } else {
                this.extension.logger.info(`Skipping undefined tool: ${toolName} in ${recipe.name}`)
            }
        }

        const newSteps = steps.map(step => {
            const newStepArgs = step.args?.map(replaceArgumentPlaceholders(rootFile))
            const newStepEnv: ProcessEnv = {}
            if (step.env) {
                Object.entries(step.env).forEach(([k, v]) => {
                    if (v) {
                        newStepEnv[k] = replaceArgumentPlaceholders(rootFile)(v)
                    }
                })
            }
            const newStep: StepCommand = {
                name: step.name,
                command: step.command,
                args: newStepArgs,
                env: newStepEnv,
            }
            return newStep
        })

        return newSteps
    }

}
