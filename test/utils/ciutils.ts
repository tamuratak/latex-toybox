import * as assert from 'assert'
import * as fs from 'fs'
import * as path from 'path'
import * as process from 'process'
import * as vscode from 'vscode'
import {sleep} from '../../src/utils/utils'
import {activate} from '../../src/main'
import type {EventName} from '../../src/components/eventbus'
import type {PdfViewerState} from '../../types/latex-workshop-protocol-types/index'
import { ExternalPromise } from '../../src/utils/externalpromise'

export {sleep}

function addLogMessage(message: string) {
    console.log(`[${new Date().toLocaleTimeString('en-US', { hour12: false })}] [DEBUG] ${message}`)
}

function getWorkspaceRootDir(): string | undefined {
    let rootDir: string | undefined
    if (vscode.workspace.workspaceFile) {
        rootDir = path.dirname(vscode.workspace.workspaceFile.fsPath)
    } else {
        rootDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    }
    return rootDir
}

export function getFixtureDir(): string {
    const fixtureDir = getWorkspaceRootDir()
    if (fixtureDir) {
        return fixtureDir
    } else {
        assert.fail('fixtureDir is undefined.')
    }
}

/**
 * Runs `cb` as a test if the basename of the working directory is equal to `fixtureName`.
 *
 * @param fixtureName The name of a fixture directory of the current test.
 * @param label Used as the title of test.
 * @param cb Callback executing tests.
 * @param skip `cb` is skipped if `true` returned.
 */
export function runTestWithFixture(
    fixtureName: string,
    label: string,
    cb: (findRootFileEnd: Promise<void>) => unknown,
    skip?: () => boolean
) {
    const rootPath = getWorkspaceRootDir()
    const shouldSkip = skip && skip()
    if (rootPath && path.basename(rootPath) === fixtureName && !shouldSkip) {
        test( fixtureName + ': ' + label, async () => {
            try {
                await waitLatexWorkshopActivated()
                const findRootFileEnd = promisify('findrootfileend')
                await cb(findRootFileEnd)
            } catch (e) {
                await printLogMessages()
                throw e
            }
        })
    }
}

/**
 * Runs `cb` as a test if the basename of the working directory is equal to `fixtureName`.
 *
 * @param fixtureName The name of a fixture directory of the current test.
 * @param label Used as the title of test.
 * @param cb Callback executing tests.
 * @param skip `cb` is skipped if `true` returned.
 */
 export function runUnitTestWithFixture(
    fixtureName: string,
    label: string,
    cb: () => unknown,
    skip?: () => boolean
) {
    const rootPath = getWorkspaceRootDir()
    const shouldSkip = skip && skip()
    if (rootPath && path.basename(rootPath) === fixtureName && !shouldSkip) {
        test( fixtureName + ': ' + label, async () => {
            try {
                await cb()
            } catch (e) {
                await printLogMessages()
                throw e
            }
        })
    }
}

export async function printLogMessages() {
    await vscode.commands.executeCommand('latex-workshop.log')
    await sleep(1000)
    await vscode.commands.executeCommand('workbench.action.output.toggleOutput')
    await sleep(1000)
    const logMessage = vscode.window.activeTextEditor?.document.getText()
    console.log(logMessage)
    await vscode.commands.executeCommand('latex-workshop.log', true)
    await sleep(1000)
    const compilerLogMessage = vscode.window.activeTextEditor?.document.getText()
    console.log(compilerLogMessage)
}

export async function execCommandThenPick(
    command: () => Thenable<unknown>,
    pick: () => Thenable<undefined>
) {
    await sleep(1000)
    let done = false
    setTimeout(async () => {
        while (!done) {
            await pick()
            await sleep(1000)
        }
    }, 3000)
    await command()
    done = true
}

export async function assertPdfIsGenerated(pdfFilePath: string, cb: () => Promise<void>) {
    if (fs.existsSync(pdfFilePath)) {
        fs.unlinkSync(pdfFilePath)
    }
    const buildFinished = promisify('buildfinished')
    await cb()
    await buildFinished
    if (fs.existsSync(pdfFilePath)) {
        return
    } else {
        assert.fail('Timeout Error: PDF file not generated.')
    }
}

type PickTruthy<T> = T | false | undefined | null

/**
 * Executes `command` repeatedly until a certain result obtained.
 * Since `command` is executed repeatedly until timeout, it must not have any side effects.
 *
 * @param command Callback to be executed.
 * @param errMessage A string to be displayed as an error message.
 */
export async function waitUntil<T>(
    command: () => PickTruthy<T> | Thenable<PickTruthy<T>>,
    limit = 70
): Promise<T> {
    for (let i = 0; i < limit; i++) {
        const result = await command()
        if (result) {
            return result
        }
        await sleep(300)
    }
    await printLogMessages()
    assert.fail('Timeout Error at waitUntil')
}

export async function promisify(event: EventName): Promise<void> {
    addLogMessage(`promisify (${event}): Start`)
    const extension = obtainLatexWorkshop()
    const resultPromise = new ExternalPromise<void>()
    const disposable = extension.exports.realExtension.eventBus.on(event, () => {
        resultPromise.resolve()
        disposable?.dispose()
    })
    setTimeout(
        () => {
            const rootFile = extension.exports.realExtension?.manager.rootFile
            if (event === 'findrootfileend' && rootFile) {
                addLogMessage(`promisify  (${event}): Timeout error, but already rootFile found`)
                resultPromise.resolve()
            } else {
                const message = `promisify (${event}): Timeout error`
                addLogMessage(message)
                resultPromise.reject(new Error(message))
            }
        },
        process.env.CI ? 30000 : 10000
    )
    return resultPromise.promise
}

export function obtainLatexWorkshop() {
    const extension = vscode.extensions.getExtension<ReturnType<typeof activate>>('James-Yu.latex-workshop')
    if (extension && extension.exports && extension.exports.realExtension) {
        const exports = extension.exports
        if (exports.realExtension) {
            const realExtension = exports.realExtension
            return {...extension, exports: {...exports, realExtension}}
        }
    }
    throw new Error('LaTeX Workshop not activated.')
}

export async function waitLatexWorkshopActivated() {
    await vscode.commands.executeCommand('latex-workshop.activate')
    return obtainLatexWorkshop()
}

export async function waitGivenRootFile(file: string) {
    await sleep(1000)
    const result = await waitUntil(() => {
        const extension = obtainLatexWorkshop()
        const rootFile = extension.exports.realExtension.manager.rootFile
        return rootFile === file
    })
    await sleep(1000)
    return result
}

export async function executeVscodeCommand(command: string) {
    return vscode.commands.executeCommand(command)
}

export async function viewPdf() {
    const promise = Promise.all([promisify('pdfviewerpagesloaded'), promisify('pdfviewerstatuschanged')])
    await executeVscodeCommand('latex-workshop.view')
    await promise
    await sleep(3000)
}

export function getViewerStatus(pdfFilePath: string) {
    const extension = obtainLatexWorkshop()
    const pdfFileUri = vscode.Uri.file(pdfFilePath)
    const rs = extension.exports.realExtension?.viewer.getViewerState(pdfFileUri)
    let ret: PdfViewerState | undefined
    if (rs && rs.length > 0 && rs[0]) {
        ret = rs[0]
    }
    if (ret && ret.pdfFileUri !== undefined && ret.scrollTop !== undefined) {
        return [{ pdfFileUri: ret.pdfFileUri, scrollTop: ret.scrollTop }]
    } else {
        assert.fail('PDF Viewer not loaded.')
    }
}
