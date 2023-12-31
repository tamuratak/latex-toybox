import * as assert from 'node:assert'
import * as path from 'node:path'
import * as vscode from 'vscode'
import {
    assertPdfIsGenerated,
    getFixtureDir,
    execCommandThenPick,
    executeVscodeCommand,
    getViewerStatus,
    runTestWithFixture,
    viewPdf,
    promisify,
    sleep
} from './utils/ciutils.js'

suite('PDF Viewer test suite', () => {

    suiteSetup(() => {
        // noop
    })

    //
    // Viewer tests
    //
    runTestWithFixture('fixture001', 'basic build and view', async (findRootFileEnd) => {
        const fixtureDir = getFixtureDir()
        const texFileName = 't.tex'
        const pdfFileName = 't.pdf'
        const pdfFilePath = path.join(fixtureDir, pdfFileName)
        await assertPdfIsGenerated(pdfFilePath, async () => {
            const texFilePath = vscode.Uri.file(path.join(fixtureDir, texFileName))
            const doc = await vscode.workspace.openTextDocument(texFilePath)
            await vscode.window.showTextDocument(doc)
            await findRootFileEnd
            await executeVscodeCommand('latex-toybox.build')
        })
        await viewPdf()
        const results = getViewerStatus(pdfFilePath)
        assert.notStrictEqual(results.length, 0)
    })

    runTestWithFixture('fixture002', 'build a subfile and view it', async (findRootFileEnd) => {
        const fixtureDir = getFixtureDir()
        const texFileName = 's.tex'
        const pdfFileName = 's.pdf'
        const pdfFilePath = path.join(fixtureDir, 'sub', pdfFileName)
        await assertPdfIsGenerated(pdfFilePath, async () => {
            const texFilePath = vscode.Uri.file(path.join(fixtureDir, 'sub', texFileName))
            const doc = await vscode.workspace.openTextDocument(texFilePath)
            await vscode.window.showTextDocument(doc)
            await findRootFileEnd
            await executeVscodeCommand('latex-toybox.build')
        })
        await viewPdf()
        const results = getViewerStatus(pdfFilePath)
        for (const result of results) {
            assert.strictEqual(result.pdfFileUri, vscode.Uri.file(pdfFilePath).toString(true))
        }
    })

    runTestWithFixture('fixture003', 'build main.tex and view it', async (findRootFileEnd) => {
        const fixtureDir = getFixtureDir()
        const texFileName = 's.tex'
        const pdfFileName = 'main.pdf'
        const pdfFilePath = path.join(fixtureDir, pdfFileName)
        await assertPdfIsGenerated(pdfFilePath, async () => {
            const texFilePath = vscode.Uri.file(path.join(fixtureDir, 'sub', texFileName))
            const doc = await vscode.workspace.openTextDocument(texFilePath)
            await vscode.window.showTextDocument(doc)
            await findRootFileEnd
            await executeVscodeCommand('latex-toybox.build')
        })
        await viewPdf()
        const results = getViewerStatus(pdfFilePath)
        for (const result of results) {
            assert.strictEqual(result.pdfFileUri, vscode.Uri.file(pdfFilePath).toString(true))
        }
    })

    runTestWithFixture('fixture004', 'build main.tex, choose it in QuickPick, and view it', async (findRootFileEnd) => {
        const fixtureDir = getFixtureDir()
        const texFileName = 's.tex'
        const pdfFileName = 'main.pdf'
        const pdfFilePath = path.join(fixtureDir, pdfFileName)
        await assertPdfIsGenerated(pdfFilePath, async () => {
            const texFilePath = vscode.Uri.file(path.join(fixtureDir, 'sub', texFileName))
            const doc = await vscode.workspace.openTextDocument(texFilePath)
            await vscode.window.showTextDocument(doc)
            await findRootFileEnd
            await execCommandThenPick(
                () => executeVscodeCommand('latex-toybox.build'),
                () => vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem')
            )
        })
        await execCommandThenPick(
            () => viewPdf(),
            () => vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem')
        )
        const results = getViewerStatus(pdfFilePath)
        for (const result of results) {
            assert.strictEqual(result.pdfFileUri, vscode.Uri.file(pdfFilePath).toString(true))
        }
    })

    runTestWithFixture('fixture005', 'build s.tex, choose it in QuickPick, and view it', async (findRootFileEnd) => {
        const fixtureDir = getFixtureDir()
        const texFileName = 's.tex'
        const pdfFileName = 's.pdf'
        const pdfFilePath = path.join(fixtureDir, 'sub', pdfFileName)
        await assertPdfIsGenerated(pdfFilePath, async () => {
            const texFilePath = vscode.Uri.file(path.join(fixtureDir, 'sub', texFileName))
            const doc = await vscode.workspace.openTextDocument(texFilePath)
            await vscode.window.showTextDocument(doc)
            await findRootFileEnd
            await execCommandThenPick(
                () => executeVscodeCommand('latex-toybox.build'),
                async () => {
                    await vscode.commands.executeCommand('workbench.action.quickOpenSelectNext')
                    await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem')
                    return undefined
                }
            )
        })
        await execCommandThenPick(
            () => viewPdf(),
            async () => {
                await vscode.commands.executeCommand('workbench.action.quickOpenSelectNext')
                await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem')
                return undefined
            }
        )
        const results = getViewerStatus(pdfFilePath)
        for (const result of results) {
            assert.strictEqual(result.pdfFileUri, vscode.Uri.file(pdfFilePath).toString(true))
        }
    })

    runTestWithFixture('fixture006', 'view a PDF file in outDir', async (findRootFileEnd) => {
        const fixtureDir = getFixtureDir()
        const texFileName = 't.tex'
        const pdfFileName = 't.pdf'
        const pdfFilePath = path.join(fixtureDir, 'out', pdfFileName)
        await assertPdfIsGenerated(pdfFilePath, async () => {
            const texFilePath = vscode.Uri.file(path.join(fixtureDir, texFileName))
            const doc = await vscode.workspace.openTextDocument(texFilePath)
            await vscode.window.showTextDocument(doc)
            await findRootFileEnd
            await executeVscodeCommand('latex-toybox.build')
        })
        await viewPdf()
        const results = getViewerStatus(pdfFilePath)
        assert.notStrictEqual(results.length, 0)
    })

    runTestWithFixture('fixture020', 'basic build, view, and synctex', async (findRootFileEnd) => {
        const fixtureDir = getFixtureDir()
        const texFileName = 't.tex'
        const pdfFileName = 't.pdf'
        const pdfFilePath = path.join(fixtureDir, pdfFileName)
        const texFilePath = vscode.Uri.file(path.join(fixtureDir, texFileName))
        const doc = await vscode.workspace.openTextDocument(texFilePath)
        await assertPdfIsGenerated(pdfFilePath, async () => {
            await vscode.window.showTextDocument(doc)
            await findRootFileEnd
            await executeVscodeCommand('latex-toybox.build')
        })
        await viewPdf()
        const firstResults = getViewerStatus(pdfFilePath)
        for (const result of firstResults) {
            assert.ok(Math.abs(result.scrollTop) < 10, 'The initial position is not correct.')
        }
        await vscode.window.showTextDocument(doc)
        await findRootFileEnd
        const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One)
        await editor.insertSnippet(new vscode.SnippetString(' $0'), new vscode.Position(5, 0))
        const promise = promisify('pdfviewerstatuschanged')
        await vscode.commands.executeCommand('latex-toybox.synctex')
        await promise
        const secondResults = getViewerStatus(pdfFilePath)
        for (const result of secondResults) {
            assert.ok(Math.abs(result.scrollTop) > 10, 'Did not scroll to the correct position with SyncTeX.')
        }
    })

    runTestWithFixture('fixture021', 'basic build, view, and synctex with synctex.afterBuild.enabled', async (findRootFileEnd) => {
        const fixtureDir = getFixtureDir()
        const texFileName = 't.tex'
        const pdfFileName = 't.pdf'
        const pdfFilePath = path.join(fixtureDir, pdfFileName)
        const texFilePath = vscode.Uri.file(path.join(fixtureDir, texFileName))
        const doc = await vscode.workspace.openTextDocument(texFilePath)
        await assertPdfIsGenerated(pdfFilePath, async () => {
            await vscode.window.showTextDocument(doc, vscode.ViewColumn.One)
            await findRootFileEnd
            await executeVscodeCommand('latex-toybox.build')
        })
        await viewPdf()
        const firstResults = getViewerStatus(pdfFilePath)
        for (const result of firstResults) {
            assert.ok(Math.abs(result.scrollTop) < 10, 'The initial scrollTop is not 0')
        }
        await vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup')
        const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One)
        await editor.insertSnippet(new vscode.SnippetString(' $0'), new vscode.Position(5, 0))
        const promise = promisify('pdfviewerstatuschanged')
        await assertPdfIsGenerated(pdfFilePath, async () => {
            await vscode.window.showTextDocument(doc, vscode.ViewColumn.One)
            await findRootFileEnd
            await executeVscodeCommand('latex-toybox.build')

        })
        await promise
        await sleep(3000)
        const secondResults = getViewerStatus(pdfFilePath)
        console.log(JSON.stringify(secondResults))
        for (const result of secondResults) {
            assert.ok(Math.abs(result.scrollTop) > 10, 'Did not scroll to the correct position with SyncTeX.')
        }
    })

})
