import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import * as cp from 'child_process'
import * as cs from 'cross-spawn'
import {replaceArgumentPlaceholders} from '../utils/utils'

import { MaxWaitingLimitError, MutexWithSizedQueue } from '../utils/mutexwithsizedqueue'
import type { EventBus } from './eventbus'
import type { Logger } from './logger'
import type { CompilerLog } from './compilerlog'
import type { Manager } from './manager'
import type { LwStatusBarItem } from './statusbaritem'
import type { Viewer } from './viewer'

const maxPrintLine = '10000'

interface ProcessEnv {
    [key: string]: string | undefined
}

export interface StepCommand {
    name: string,
    command: string,
    args?: string[],
    env?: ProcessEnv
}

interface Recipe {
    name: string,
    tools: (string | StepCommand)[]
}

export class Builder {
    private currentProcess: cp.ChildProcessWithoutNullStreams | undefined
    private readonly buildMutex = new MutexWithSizedQueue(1)
    private previouslyUsedRecipe: Recipe | undefined
    private previousLanguageId: string | undefined

    constructor(private readonly extension: {
        eventBus: EventBus,
        logger: Logger,
        compilerLog: CompilerLog,
        manager: Manager,
        statusbaritem: LwStatusBarItem,
        viewer: Viewer
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
        if (rootFile) {
            // Stop watching the PDF file to avoid reloading the PDF viewer twice.
            // The builder will be responsible for refreshing the viewer.
            this.extension.manager.ignorePdfFile(rootFile)
        }
        const releaseBuildMutex = await this.preprocess()
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

        const stepLog = this.extension.compilerLog.createStepLog(rootFile, [{name: 'external', command, args}], 0)
        this.currentProcess.stdout.on('data', (newStdout: Buffer | string) => {
            stepLog.append(newStdout.toString())
        })

        this.currentProcess.stderr.on('data', (newStderr: Buffer | string) => {
            stepLog.appendError(newStderr.toString())
        })

        this.currentProcess.on('error', err => {
            this.extension.logger.error(`Build fatal error: ${err.message}, ${stepLog.stderr}. PID: ${pid}. Does the executable exist?`)
            this.extension.statusbaritem.displayStatus('fail', 'Build failed.')
            this.currentProcess = undefined
            releaseBuildMutex()
        })

        this.currentProcess.on('exit', async (exitCode, signal) => {
            void this.extension.compilerLog.parse(stepLog)
            if (exitCode !== 0) {
                this.extension.logger.error(`Build returns with error: ${exitCode}/${signal}. PID: ${pid}.`)
                this.extension.statusbaritem.displayStatus('fail', 'Build failed.')
            } else {
                this.extension.logger.info(`Successfully built. PID: ${pid}`)
                this.extension.statusbaritem.displayStatus('success', 'Build succeeded.')
                try {
                    if (rootFile === undefined) {
                        this.extension.viewer.refreshExistingViewer()
                    } else {
                        await this.buildFinished(rootFile)
                    }
                } finally {
                    this.currentProcess = undefined
                    releaseBuildMutex()
                }
            }
            this.currentProcess = undefined
            releaseBuildMutex()
        })
    }

    private buildInitiator(rootFile: string, languageId: string, recipeName: string | undefined = undefined, releaseBuildMutex: () => void) {
        const steps = this.createSteps(rootFile, languageId, recipeName)
        if (steps === undefined) {
            this.extension.logger.error('Invalid toolchain.')
            return
        }
        this.buildStep(rootFile, steps, 0, recipeName || 'Build', releaseBuildMutex) // use 'Build' as default name
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
            // This was supposed to create the outputDir as latexmk does not
            // take care of it (neither does any of latex command). If the
            //output directory does not exist, the latex commands simply fail.
            const rootDir = path.dirname(rootFile)
            let outDir = this.extension.manager.getOutDir(rootFile)
            if (!path.isAbsolute(outDir)) {
                outDir = path.resolve(rootDir, outDir)
            }
            this.extension.logger.info(`outDir: ${outDir}`)
            this.extension.manager.getIncludedTeX(rootFile).forEach(file => {
                const relativePath = path.dirname(file.replace(rootDir, '.'))
                const fullOutDir = path.resolve(outDir, relativePath)
                // To avoid issues when fullOutDir is the root dir
                // Using fs.mkdir() on the root directory even with recursion will result in an error
                if (! (fs.existsSync(fullOutDir) && fs.statSync(fullOutDir).isDirectory())) {
                    fs.mkdirSync(fullOutDir, { recursive: true })
                }
            })
            this.buildInitiator(rootFile, languageId, recipeName, releaseBuildMutex)
        } catch (e) {
            this.extension.logger.error('Unexpected Error: please see the console log of the Developer Tools of VS Code.')
            this.extension.statusbaritem.displayStatus('fail', 'Build failed.')
            releaseBuildMutex()
            throw(e)
        }
    }

    private progressString(recipeName: string, steps: StepCommand[], index: number) {
        if (steps.length < 2) {
            return recipeName
        } else {
            return recipeName + `: ${index + 1}/${steps.length} (${steps[index].name})`
        }
    }

    private buildStep(rootFile: string, steps: StepCommand[], index: number, recipeName: string, releaseBuildMutex: () => void) {
        if (index === 0) {
            this.extension.compilerLog.clear()
        }
        this.extension.statusbaritem.displayStatus('ongoing', '', ` ${this.progressString(recipeName, steps, index)}`)
        this.extension.logger.logCommand(`Recipe step ${index + 1}`, steps[index].command, steps[index].args)
        this.extension.logger.info(`Recipe step env: ${JSON.stringify(steps[index].env)}`)
        const envVars = Object.create(null) as ProcessEnv
        Object.keys(process.env).forEach(key => envVars[key] = process.env[key])
        const currentEnv = steps[index].env
        if (currentEnv) {
            Object.keys(currentEnv).forEach(key => envVars[key] = currentEnv[key])
        }
        // We log $Path too since `Object.keys(process.env)` includes Path, not PATH on Windows.
        const envVarsPATH = envVars['PATH']
        const envVarsPath = envVars['Path']
        envVars['max_print_line'] = maxPrintLine
        let workingDirectory: string
        if (steps[index].command === 'latexmk' && rootFile === this.extension.manager.localRootFile && this.extension.manager.rootDir) {
            workingDirectory = this.extension.manager.rootDir
        } else {
            workingDirectory = path.dirname(rootFile)
        }
        this.extension.logger.info(`cwd: ${workingDirectory}`)
        this.currentProcess = cs.spawn(steps[index].command, steps[index].args, {cwd: workingDirectory, env: envVars})
        const pid = this.currentProcess.pid
        this.extension.logger.info(`LaTeX build process spawned. PID: ${pid}.`)

        const stepLog = this.extension.compilerLog.createStepLog(rootFile, steps, index)

        this.currentProcess.stdout.on('data', (newStdout: Buffer | string) => {
            stepLog.append(newStdout.toString())
        })

        this.currentProcess.stderr.on('data', (newStderr: Buffer | string) => {
            stepLog.appendError(newStderr.toString())
        })

        this.currentProcess.on('error', err => {
            this.extension.logger.error(`LaTeX fatal error: ${err.message}, ${stepLog.stderr}. PID: ${pid}.`)
            this.extension.logger.error(`Does the executable exist? $PATH: ${envVarsPATH}`)
            this.extension.logger.error(`Does the executable exist? $Path: ${envVarsPath}`)
            this.extension.logger.error(`The environment variable $SHELL: ${process.env.SHELL}`)
            this.extension.statusbaritem.displayStatus('fail', 'Build failed.')
            this.currentProcess = undefined
            releaseBuildMutex()
        })

        this.currentProcess.on('exit', async (exitCode, signal) => {
            void this.extension.compilerLog.parse(stepLog, rootFile)
            if (exitCode !== 0) {
                this.extension.logger.error(`Recipe returns with error: ${exitCode}/${signal}. PID: ${pid}. message: ${stepLog.stderr}.`)
                this.extension.logger.error(`The environment variable $PATH: ${envVarsPATH}`)
                this.extension.logger.error(`The environment variable $Path: ${envVarsPath}`)
                this.extension.logger.error(`The environment variable $SHELL: ${process.env.SHELL}`)

                this.extension.statusbaritem.displayStatus('fail', 'Build failed.')
                this.currentProcess = undefined
                releaseBuildMutex()
            } else {
                if (index === steps.length - 1) {
                    this.extension.logger.info(`Recipe of length ${steps.length} finished. PID: ${pid}.`)
                    try {
                        await this.buildFinished(rootFile)
                    } finally {
                        this.currentProcess = undefined
                        releaseBuildMutex()
                    }
                } else {
                    this.extension.logger.info(`A step in recipe finished. PID: ${pid}.`)
                    this.buildStep(rootFile, steps, index + 1, recipeName, releaseBuildMutex)
                }
            }
        })
    }

    private async buildFinished(rootFile: string) {
        this.extension.logger.info(`Successfully built ${rootFile}.`)
        this.extension.statusbaritem.displayStatus('success', 'Recipe succeeded.')
        if (this.extension.compilerLog.isLaTeXmkSkipped) {
            return
        }
        await this.extension.eventBus.buildFinished.fire(rootFile)
    }

    private createSteps(rootFile: string, languageId: string, recipeName: string | undefined): StepCommand[] | undefined {
        let steps: StepCommand[] = []
        const configuration = vscode.workspace.getConfiguration('latex-workshop', vscode.Uri.file(rootFile))

        const recipes = configuration.get('latex.recipes') as Recipe[]
        const defaultRecipeName = configuration.get('latex.recipe.default') as string
        const tools = configuration.get('latex.tools') as StepCommand[]
        if (recipes.length < 1) {
            this.extension.logger.error('No recipes defined.')
            return undefined
        }
        let recipe: Recipe | undefined = undefined
        if (this.previousLanguageId !== languageId) {
            this.previouslyUsedRecipe = undefined
        }
        if (!recipeName && ! ['first', 'lastUsed'].includes(defaultRecipeName)) {
            recipeName = defaultRecipeName
        }
        if (recipeName) {
            const candidates = recipes.filter(candidate => candidate.name === recipeName)
            if (candidates.length < 1) {
                this.extension.logger.error(`Failed to resolve build recipe: ${recipeName}`)
            }
            recipe = candidates[0]
        }
        if (recipe === undefined) {
            if (defaultRecipeName === 'lastUsed') {
                recipe = this.previouslyUsedRecipe
            }
            if (defaultRecipeName === 'first' || recipe === undefined) {
                let candidates: Recipe[] = recipes
                if (languageId === 'rsweave') {
                    candidates = recipes.filter(candidate => candidate.name.toLowerCase().match('rnw|rsweave'))
                } else if (languageId === 'jlweave') {
                    candidates = recipes.filter(candidate => candidate.name.toLowerCase().match('jnw|jlweave|weave.jl'))
                }
                if (candidates.length < 1) {
                    this.extension.logger.error(`Failed to resolve build recipe: ${recipeName}`)
                }
                recipe = candidates[0]
            }
        }
        if (recipe === undefined) {
            return undefined
        }
        this.previouslyUsedRecipe = recipe
        this.previousLanguageId = languageId

        recipe.tools.forEach(tool => {
            if (typeof tool === 'string') {
                const candidates = tools.filter(candidate => candidate.name === tool)
                if (candidates.length < 1) {
                    this.extension.logger.info(`Skipping undefined tool: ${tool} in ${recipe?.name}`)
                } else {
                    steps.push(candidates[0])
                }
            } else {
                steps.push(tool)
            }
        })

        /**
         * Use JSON.parse and JSON.stringify for a deep copy.
         */
        steps = JSON.parse(JSON.stringify(steps)) as StepCommand[]

        steps.forEach(step => {
            if (step.args) {
                step.args = step.args.map(replaceArgumentPlaceholders(rootFile))
            }
            if (step.env) {
                Object.keys(step.env).forEach( v => {
                    const e = step.env && step.env[v]
                    if (step.env && e) {
                        step.env[v] = replaceArgumentPlaceholders(rootFile)(e)
                    }
                })
            }
            if (configuration.get('latex.option.maxPrintLine.enabled')) {
                if (!step.args) {
                    step.args = []
                }
            }
        })
        return steps
    }

}
