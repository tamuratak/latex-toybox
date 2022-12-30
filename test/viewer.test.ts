import * as assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'
import {
    assertPdfIsGenerated,
    getFixtureDir,
    execCommandThenPick,
    executeVscodeCommandAfterActivation,
    getViewerStatus,
    runTestWithFixture,
    viewPdf,
    promisify,
    sleep
} from './utils/ciutils'

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
            await executeVscodeCommandAfterActivation('latex-workshop.build')
        })
        await viewPdf()
        const results = await getViewerStatus(pdfFilePath)
        assert.ok(results.length > 0)
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
            await executeVscodeCommandAfterActivation('latex-workshop.build')
        })
        await viewPdf()
        const results = await getViewerStatus(pdfFilePath)
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
            await executeVscodeCommandAfterActivation('latex-workshop.build')
        })
        await viewPdf()
        const results = await getViewerStatus(pdfFilePath)
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
                () => executeVscodeCommandAfterActivation('latex-workshop.build'),
                () => vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem')
            )
        })
        await execCommandThenPick(
            () => viewPdf(),
            () => vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem')
        )
        const results = await getViewerStatus(pdfFilePath)
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
                () => executeVscodeCommandAfterActivation('latex-workshop.build'),
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
        const results = await getViewerStatus(pdfFilePath)
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
            await executeVscodeCommandAfterActivation('latex-workshop.build')
        })
        await viewPdf()
        const results = await getViewerStatus(pdfFilePath)
        assert.ok(results.length > 0)
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
            await executeVscodeCommandAfterActivation('latex-workshop.build')
        })
        await viewPdf()
        const firstResults = await getViewerStatus(pdfFilePath)
        for (const result of firstResults) {
            assert.ok( Math.abs(result.scrollTop) < 10 )
        }
        await vscode.window.showTextDocument(doc)
        await findRootFileEnd
        const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One)
        await editor.insertSnippet(new vscode.SnippetString(' $0'), new vscode.Position(5, 0))
        const promise = promisify('pdfviewerstatuschanged')
        await vscode.commands.executeCommand('latex-workshop.synctex')
        await promise
        const secondResults = await getViewerStatus(pdfFilePath)
        for (const result of secondResults) {
            assert.ok( Math.abs(result.scrollTop) > 10 )
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
            await executeVscodeCommandAfterActivation('latex-workshop.build')
        })
        await viewPdf()
        const firstResults = await getViewerStatus(pdfFilePath)
        for (const result of firstResults) {
            assert.ok( Math.abs(result.scrollTop) < 10 )
        }
        await vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup')
        const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One)
        await editor.insertSnippet(new vscode.SnippetString(' $0'), new vscode.Position(5, 0))
        const promise = promisify('pdfviewerstatuschanged')
        await assertPdfIsGenerated(pdfFilePath, async () => {
            await vscode.window.showTextDocument(doc, vscode.ViewColumn.One)
            await findRootFileEnd
            await executeVscodeCommandAfterActivation('latex-workshop.build')

        })
        await promise
        await sleep(3000)
        const secondResults = await getViewerStatus(pdfFilePath)
        console.log(JSON.stringify(secondResults))
        for (const result of secondResults) {
            assert.ok( Math.abs(result.scrollTop) > 10 )
        }
    })

})
