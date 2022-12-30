import * as assert from 'assert'
import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import * as os from 'os'
import {
    assertPdfIsGenerated,
    executeVscodeCommandAfterActivation,
    execCommandThenPick,
    getFixtureDir,
    runTestWithFixture
} from './utils/ciutils'
import {sleep} from './utils/ciutils'

suite('Build TeX files test suite', () => {

    suiteSetup(() => {
        // noop
    })

    //
    // Basic build tests
    //
    runTestWithFixture('fixture001', 'basic build', async (findRootFileEnd) => {
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
    })

    runTestWithFixture('fixture002', 'build with subfiles', async (findRootFileEnd) => {
        const fixtureDir = getFixtureDir()
        const texFileName = 'main.tex'
        const pdfFileName = 'main.pdf'
        const pdfFilePath = path.join(fixtureDir, pdfFileName)
        await assertPdfIsGenerated(pdfFilePath, async () => {
            const texFilePath = vscode.Uri.file(path.join(fixtureDir, texFileName))
            const doc = await vscode.workspace.openTextDocument(texFilePath)
            await vscode.window.showTextDocument(doc)
            await findRootFileEnd
            await executeVscodeCommandAfterActivation('latex-workshop.build')
        })
    })

    runTestWithFixture('fixture003', 'the same multiple placeholders in a recipe', async (findRootFileEnd) => {
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
    })

    runTestWithFixture('fixture004', 'automatically detect root', async (findRootFileEnd) => {
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
    })

    runTestWithFixture('fixture005', 'basic build with outDir', async (findRootFileEnd) => {
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
    })

    runTestWithFixture('fixture006', 'detect root with search.rootFiles.include', async (findRootFileEnd) => {
        const fixtureDir = getFixtureDir()
        const texFileName = 's.tex'
        const pdfFileName = 'main.pdf'
        const pdfFilePath = path.join(fixtureDir, 'main', pdfFileName)
        await assertPdfIsGenerated(pdfFilePath, async () => {
            const texFilePath = vscode.Uri.file(path.join(fixtureDir, 'sub', texFileName))
            const doc = await vscode.workspace.openTextDocument(texFilePath)
            await vscode.window.showTextDocument(doc)
            await findRootFileEnd
            await executeVscodeCommandAfterActivation('latex-workshop.build')
        })
    })

    runTestWithFixture('fixture007', 'detect root with search.rootFiles.exclude', async (findRootFileEnd) => {
        const fixtureDir = getFixtureDir()
        const texFileName = 's.tex'
        const pdfFileName = 'main.pdf'
        const pdfFilePath = path.join(fixtureDir, 'main', pdfFileName)
        await assertPdfIsGenerated(pdfFilePath, async () => {
            const texFilePath = vscode.Uri.file(path.join(fixtureDir, 'sub', texFileName))
            const doc = await vscode.workspace.openTextDocument(texFilePath)
            await vscode.window.showTextDocument(doc)
            await findRootFileEnd
            await executeVscodeCommandAfterActivation('latex-workshop.build')
        })
    })

    runTestWithFixture('fixture008', 'basic build with spaces in names', async (findRootFileEnd) => {
        const fixtureDir = getFixtureDir()
        const subDir = 'root dir'
        const texFileName = path.join(subDir, 'file t.tex')
        const pdfFileName = path.join(subDir, 'file t.pdf')
        const pdfFilePath = path.join(fixtureDir, pdfFileName)
        await assertPdfIsGenerated(pdfFilePath, async () => {
            const texFilePath = vscode.Uri.file(path.join(fixtureDir, texFileName))
            const doc = await vscode.workspace.openTextDocument(texFilePath)
            await vscode.window.showTextDocument(doc)
            await findRootFileEnd
            await executeVscodeCommandAfterActivation('latex-workshop.build')
        })
    })

    runTestWithFixture('fixture009', 'basic build with spaces in outdir', async (findRootFileEnd) => {
        const fixtureDir = getFixtureDir()
        const texFileName = 't.tex'
        const pdfFileName = 't.pdf'
        const pdfFilePath = path.join(fixtureDir, 'out dir', pdfFileName)
        await assertPdfIsGenerated(pdfFilePath, async () => {
            const texFilePath = vscode.Uri.file(path.join(fixtureDir, texFileName))
            const doc = await vscode.workspace.openTextDocument(texFilePath)
            await vscode.window.showTextDocument(doc)
            await findRootFileEnd
            await executeVscodeCommandAfterActivation('latex-workshop.build')
        })
    })

    runTestWithFixture('fixture010', 'basic build with spaces in outdir', async (findRootFileEnd) => {
        const fixtureDir = getFixtureDir()
        const texFileName = 't.tex'
        const pdfFileName = 't.pdf'
        const pdfFilePath = path.join(fixtureDir, 'out dir', 'build', pdfFileName)
        await assertPdfIsGenerated(pdfFilePath, async () => {
            const texFilePath = vscode.Uri.file(path.join(fixtureDir, texFileName))
            const doc = await vscode.workspace.openTextDocument(texFilePath)
            await vscode.window.showTextDocument(doc)
            await findRootFileEnd
            await executeVscodeCommandAfterActivation('latex-workshop.build')
        })
    }, () => os.platform() !== 'win32')

    runTestWithFixture('fixture011', 'automatically detect root with verbatim content', async (findRootFileEnd) => {
        const fixtureDir = getFixtureDir()
        const texFileName = 's.tex'
        const pdfFileName = 'main.pdf'
        const pdfFilePath = path.join(fixtureDir, pdfFileName)
        await assertPdfIsGenerated(pdfFilePath, async () => {
            const texFilePath = vscode.Uri.file(path.join(fixtureDir, texFileName))
            const doc = await vscode.workspace.openTextDocument(texFilePath)
            await vscode.window.showTextDocument(doc)
            await findRootFileEnd
            await executeVscodeCommandAfterActivation('latex-workshop.build')
        })
    })

    //
    // Magic comment tests
    //
    runTestWithFixture('fixture020', 'build with magic comment', async (findRootFileEnd) => {
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
    })

    runTestWithFixture('fixture021', 'build with !TEX program and !TEX options', async (findRootFileEnd) => {
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
    })

    runTestWithFixture('fixture022', 'build with !TEX root', async (findRootFileEnd) => {
        const fixtureDir = getFixtureDir()
        const texFileName = 's.tex'
        const pdfFileName = 'z.pdf'
        const pdfFilePath = path.join(fixtureDir, pdfFileName)
        await assertPdfIsGenerated(pdfFilePath, async () => {
            const texFilePath = vscode.Uri.file(path.join(fixtureDir, 'sub', texFileName))
            const doc = await vscode.workspace.openTextDocument(texFilePath)
            await vscode.window.showTextDocument(doc)
            await findRootFileEnd
            await executeVscodeCommandAfterActivation('latex-workshop.build')
        })
    })

    runTestWithFixture('fixture023', 'build with invalid !TEX program', async (findRootFileEnd) => {
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
    })

    runTestWithFixture('fixture024', 'build with forceRecipeUsage: true', async (findRootFileEnd) => {
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
    })

    //
    // Auto build tests
    //
    runTestWithFixture('fixture030', 'auto build', async (findRootFileEnd) => {
        const fixtureDir = getFixtureDir()
        const texFileName = 't.tex'
        const pdfFileName = 't.pdf'
        const pdfFilePath = path.join(fixtureDir, pdfFileName)
        await assertPdfIsGenerated(pdfFilePath, async () => {
            const texFilePath = vscode.Uri.file(path.join(fixtureDir, texFileName))
            const doc = await vscode.workspace.openTextDocument(texFilePath)
            const editor = await vscode.window.showTextDocument(doc)
            await findRootFileEnd
            await editor.edit((builder) => {
                builder.insert(new vscode.Position(0, 0), ' ')
            })
            await doc.save()
        })
    })

    runTestWithFixture('fixture031', 'auto build with subfiles and onFileChange', async (findRootFileEnd) => {
        const fixtureDir = getFixtureDir()
        const texFileName = 's.tex'
        const pdfFileName = 's.pdf'
        const pdfFilePath = path.join(fixtureDir, 'sub', pdfFileName)
        await assertPdfIsGenerated(pdfFilePath, async () => {
            const texFilePath = vscode.Uri.file(path.join(fixtureDir, 'sub', texFileName))
            const doc = await vscode.workspace.openTextDocument(texFilePath)
            const editor = await vscode.window.showTextDocument(doc)
            await findRootFileEnd
            await sleep(1000)
            await editor.edit((builder) => {
                builder.insert(new vscode.Position(2, 0), ' ')
            })
            await doc.save()
        })
    })

    runTestWithFixture('fixture032', 'auto build with input', async (findRootFileEnd) => {
        const fixtureDir = getFixtureDir()
        const texFileName = 's.tex'
        const pdfFileName = 'main.pdf'
        const pdfFilePath = path.join(fixtureDir, pdfFileName)
        await assertPdfIsGenerated(pdfFilePath, async () => {
            const texFilePath = vscode.Uri.file(path.join(fixtureDir, 'sub', texFileName))
            const doc = await vscode.workspace.openTextDocument(texFilePath)
            const editor = await vscode.window.showTextDocument(doc)
            await findRootFileEnd
            await sleep(1000)
            await editor.edit((builder) => {
                builder.insert(new vscode.Position(1, 0), ' ')
            })
            await doc.save()
        })
    })

    runTestWithFixture('fixture033', 'auto build main.tex when editing s.tex with onFileChange', async (findRootFileEnd) => {
        const fixtureDir = getFixtureDir()
        const texFileName = 's.tex'
        const pdfFileName = 'main.pdf'
        const pdfFilePath = path.join(fixtureDir, pdfFileName)
        await assertPdfIsGenerated(pdfFilePath, async () => {
            const texFilePath = vscode.Uri.file(path.join(fixtureDir, 'sub', texFileName))
            const doc = await vscode.workspace.openTextDocument(texFilePath)
            const editor = await vscode.window.showTextDocument(doc)
            await findRootFileEnd
            await sleep(1000)
            await editor.edit((builder) => {
                builder.insert(new vscode.Position(2, 0), ' ')
            })
            await doc.save()
        })
    })

    runTestWithFixture('fixture034', 'auto build main.tex when editing a bib file', async (findRootFileEnd) => {
        const fixtureDir = getFixtureDir()
        const bibFileName = 'b.bib'
        const texFileName = 't.tex'
        const pdfFileName = 't.pdf'
        const pdfFilePath = path.join(fixtureDir, pdfFileName)
        const texFilePath = vscode.Uri.file(path.join(fixtureDir, texFileName))
        const doc = await vscode.workspace.openTextDocument(texFilePath)
        await vscode.window.showTextDocument(doc)
        await findRootFileEnd
        await assertPdfIsGenerated(pdfFilePath, async () => {
            const bibFilePath = vscode.Uri.file(path.join(fixtureDir, bibFileName))
            const bibDoc = await vscode.workspace.openTextDocument(bibFilePath)
            const editor = await vscode.window.showTextDocument(bibDoc)
            await sleep(1000)
            await editor.edit((builder) => {
                builder.insert(new vscode.Position(1, 0), ' ')
            })
            await bibDoc.save()
        })
    })

    runTestWithFixture('fixture035', 'auto build with \\input whose path uses a macro', async (findRootFileEnd) => {
        const fixtureDir = getFixtureDir()
        const texFileName = 's.tex'
        const pdfFileName = 'main.pdf'
        const pdfFilePath = path.join(fixtureDir, 'main', pdfFileName)
        const mainTexFilePath = vscode.Uri.file(path.join(fixtureDir, 'main', 'main.tex'))
        const mainDoc = await vscode.workspace.openTextDocument(mainTexFilePath)
        await vscode.window.showTextDocument(mainDoc)
        await findRootFileEnd
        await assertPdfIsGenerated(pdfFilePath, async () => {
            await executeVscodeCommandAfterActivation('latex-workshop.build')
        })
        await assertPdfIsGenerated(pdfFilePath, async () => {
            const texFilePath = vscode.Uri.file(path.join(fixtureDir, 'sub', texFileName))
            const doc = await vscode.workspace.openTextDocument(texFilePath)
            const editor = await vscode.window.showTextDocument(doc)
            await sleep(1000)
            await editor.edit((builder) => {
                builder.insert(new vscode.Position(1, 0), ' ')
            })
            await doc.save()
        })
    })

    runTestWithFixture('fixture036', 'auto build main.tex when main.tex not in root dir and editing a sub file', async (findRootFileEnd) => {
        const fixtureDir = getFixtureDir()
        const texFileName = 's.tex'
        const pdfFileName = 'main.pdf'
        const pdfFilePath = path.join(fixtureDir, 'main', pdfFileName)
        const mainTexFilePath = vscode.Uri.file(path.join(fixtureDir, 'main', 'main.tex'))
        const mainDoc = await vscode.workspace.openTextDocument(mainTexFilePath)
        await vscode.window.showTextDocument(mainDoc)
        await findRootFileEnd
        await assertPdfIsGenerated(pdfFilePath, async () => {
            await executeVscodeCommandAfterActivation('latex-workshop.build')
        })
        await assertPdfIsGenerated(pdfFilePath, async () => {
            const texFilePath = vscode.Uri.file(path.join(fixtureDir, 'sub', texFileName))
            const doc = await vscode.workspace.openTextDocument(texFilePath)
            const editor = await vscode.window.showTextDocument(doc)
            await sleep(1000)
            await editor.edit((builder) => {
                builder.insert(new vscode.Position(1, 0), ' ')
            })
            await doc.save()
        })
    })

    runTestWithFixture('fixture037', 'auto build with \\input and outDir', async (findRootFileEnd) => {
        const fixtureDir = getFixtureDir()
        const texFileName = 's.tex'
        const pdfFileName = 'main.pdf'
        const pdfFilePath = path.join(fixtureDir, 'main', 'out', pdfFileName)
        const mainTexFilePath = vscode.Uri.file(path.join(fixtureDir, 'main', 'main.tex'))
        const mainDoc = await vscode.workspace.openTextDocument(mainTexFilePath)
        await vscode.window.showTextDocument(mainDoc)
        await findRootFileEnd
        await assertPdfIsGenerated(pdfFilePath, async () => {
            await executeVscodeCommandAfterActivation('latex-workshop.build')
        })
        await assertPdfIsGenerated(pdfFilePath, async () => {
            const texFilePath = vscode.Uri.file(path.join(fixtureDir, 'sub', texFileName))
            const doc = await vscode.workspace.openTextDocument(texFilePath)
            const editor = await vscode.window.showTextDocument(doc)
            await sleep(1000)
            await editor.edit((builder) => {
                builder.insert(new vscode.Position(1, 0), ' ')
            })
            await doc.save()
        })
    })

    runTestWithFixture('fixture038', 'auto build with watch.files.ignore', async (findRootFileEnd) => {
        const fixtureDir = getFixtureDir()
        const mainTexFileName = 'main.tex'
        const subTexFileName = 's.tex'
        const pdfFileName = 'main.pdf'
        const pdfFilePath = path.join(fixtureDir, pdfFileName)
        await assertPdfIsGenerated(pdfFilePath, async () => {
            const texFilePath = vscode.Uri.file(path.join(fixtureDir, mainTexFileName))
            const doc = await vscode.workspace.openTextDocument(texFilePath)
            await vscode.window.showTextDocument(doc)
            await findRootFileEnd
            await executeVscodeCommandAfterActivation('latex-workshop.build')
        })
        fs.unlinkSync(pdfFilePath)
        const subTexFilePath = vscode.Uri.file(path.join(fixtureDir, 'sub', subTexFileName))
        const subDoc = await vscode.workspace.openTextDocument(subTexFilePath)
        const editor = await vscode.window.showTextDocument(subDoc)
        await sleep(1000)
        await editor.edit((builder) => {
            builder.insert(new vscode.Position(1, 0), ' ')
        })
        await subDoc.save()
        await sleep(5000)
        assert.ok( !fs.existsSync(pdfFilePath) )
    })

    runTestWithFixture('fixture039', 'auto build with subfiles and onSave', async (findRootFileEnd) => {
        const fixtureDir = getFixtureDir()
        const texFileName = 's.tex'
        const pdfFileName = 's.pdf'
        const pdfFilePath = path.join(fixtureDir, 'sub', pdfFileName)
        await assertPdfIsGenerated(pdfFilePath, async () => {
            const texFilePath = vscode.Uri.file(path.join(fixtureDir, 'sub', texFileName))
            const doc = await vscode.workspace.openTextDocument(texFilePath)
            const editor = await vscode.window.showTextDocument(doc)
            await findRootFileEnd
            await sleep(1000)
            await editor.edit((builder) => {
                builder.insert(new vscode.Position(2, 0), ' ')
            })
            await doc.save()
        })
    })

    runTestWithFixture('fixture03a', 'auto build main.tex when editing s.tex with onSave', async (findRootFileEnd) => {
        const fixtureDir = getFixtureDir()
        const texFileName = 's.tex'
        const pdfFileName = 'main.pdf'
        const pdfFilePath = path.join(fixtureDir, pdfFileName)
        await assertPdfIsGenerated(pdfFilePath, async () => {
            const texFilePath = vscode.Uri.file(path.join(fixtureDir, 'sub', texFileName))
            const doc = await vscode.workspace.openTextDocument(texFilePath)
            const editor = await vscode.window.showTextDocument(doc)
            await findRootFileEnd
            await sleep(1000)
            await editor.edit((builder) => {
                builder.insert(new vscode.Position(2, 0), ' ')
            })
            await doc.save()
        })
    })


    //
    // Multi-file project build tests
    //
    runTestWithFixture('fixture050', 'build a subfile with the subfiles package', async (findRootFileEnd) => {
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
    })

    runTestWithFixture('fixture051', 'build a root file with the subfiles package', async (findRootFileEnd) => {
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
    })

    runTestWithFixture('fixture052', 'build a root file in a sub directory', async (findRootFileEnd) => {
        const fixtureDir = getFixtureDir()
        const texFileName = 'mainsub.tex'
        const pdfFileName = 'mainsub.pdf'
        const pdfFilePath = path.join(fixtureDir, 'sub', pdfFileName)
        await assertPdfIsGenerated(pdfFilePath, async () => {
            const texFilePath = vscode.Uri.file(path.join(fixtureDir, 'sub', texFileName))
            const doc = await vscode.workspace.openTextDocument(texFilePath)
            await vscode.window.showTextDocument(doc)
            await findRootFileEnd
            await executeVscodeCommandAfterActivation('latex-workshop.build')
        })
    })

    runTestWithFixture('fixture053', 'build a subfile when main.tex opened', async (findRootFileEnd) => {
        const fixtureDir = getFixtureDir()
        const texFileName = 's.tex'
        const pdfFileName = 's.pdf'
        const pdfFilePath = path.join(fixtureDir, 'sub', pdfFileName)
        await assertPdfIsGenerated(pdfFilePath, async () => {
            const mainTexFilePath = vscode.Uri.file(path.join(fixtureDir, 'main.tex'))
            const mainDoc = await vscode.workspace.openTextDocument(mainTexFilePath)
            await vscode.window.showTextDocument(mainDoc)
            await findRootFileEnd
            const subTexFilePath = vscode.Uri.file(path.join(fixtureDir, 'sub', texFileName))
            const doc = await vscode.workspace.openTextDocument(subTexFilePath)
            await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside)
            await executeVscodeCommandAfterActivation('latex-workshop.build')
        })
    })

    runTestWithFixture('fixture054', 'build a subfile with .latexmkrc', async (findRootFileEnd) => {
        const fixtureDir = getFixtureDir()
        const texFileName = 's.tex'
        const pdfFileName = 's.pdf'
        const pdfFilePath = path.join(fixtureDir, 'sub', 'out', pdfFileName)
        await assertPdfIsGenerated(pdfFilePath, async () => {
            const texFilePath = vscode.Uri.file(path.join(fixtureDir, 'sub', texFileName))
            const doc = await vscode.workspace.openTextDocument(texFilePath)
            await vscode.window.showTextDocument(doc)
            await findRootFileEnd
            await executeVscodeCommandAfterActivation('latex-workshop.build')
        })
    })

    runTestWithFixture('fixture055', 'build a subfile in the same directory as main.tex', async (findRootFileEnd) => {
        const fixtureDir = getFixtureDir()
        const texFileName = 's.tex'
        const pdfFileName = 's.pdf'
        const pdfFilePath = path.join(fixtureDir, pdfFileName)
        await assertPdfIsGenerated(pdfFilePath, async () => {
            const texFilePath = vscode.Uri.file(path.join(fixtureDir, texFileName))
            const doc = await vscode.workspace.openTextDocument(texFilePath)
            await vscode.window.showTextDocument(doc)
            await findRootFileEnd
            await executeVscodeCommandAfterActivation('latex-workshop.build')
        })
    })

    runTestWithFixture('fixture056', 'build main.tex with input whose path uses a macro when subfile opened', async (findRootFileEnd) => {
        const fixtureDir = getFixtureDir()
        const texFileName = 's.tex'
        const pdfFileName = 'main.pdf'
        const pdfFilePath = path.join(fixtureDir, 'main', pdfFileName)
        const mainTexFilePath = vscode.Uri.file(path.join(fixtureDir, 'main', 'main.tex'))
        const mainDoc = await vscode.workspace.openTextDocument(mainTexFilePath)
        await vscode.window.showTextDocument(mainDoc)
        await findRootFileEnd
        await assertPdfIsGenerated(pdfFilePath, async () => {
            await executeVscodeCommandAfterActivation('latex-workshop.build')
        })
        await assertPdfIsGenerated(pdfFilePath, async () => {
            const texFilePath = vscode.Uri.file(path.join(fixtureDir, 'sub', texFileName))
            const doc = await vscode.workspace.openTextDocument(texFilePath)
            await vscode.window.showTextDocument(doc)
            await sleep(1000)
            await executeVscodeCommandAfterActivation('latex-workshop.build')
        })
    })

    runTestWithFixture('fixture057', 'build main.tex with subfiles whose path uses a macro when subfile opened', async (findRootFileEnd) => {
        const fixtureDir = getFixtureDir()
        const texFileName = 's.tex'
        const pdfFileName = 'main.pdf'
        const pdfFilePath = path.join(fixtureDir, 'main', pdfFileName)
        const mainTexFilePath = vscode.Uri.file(path.join(fixtureDir, 'main', 'main.tex'))
        const mainDoc = await vscode.workspace.openTextDocument(mainTexFilePath)
        await vscode.window.showTextDocument(mainDoc)
        await findRootFileEnd
        await assertPdfIsGenerated(pdfFilePath, async () => {
            await executeVscodeCommandAfterActivation('latex-workshop.build')
        })
        await assertPdfIsGenerated(pdfFilePath, async () => {
            const texFilePath = vscode.Uri.file(path.join(fixtureDir, 'sub', texFileName))
            const doc = await vscode.workspace.openTextDocument(texFilePath)
            await vscode.window.showTextDocument(doc)
            await sleep(1000)
            await executeVscodeCommandAfterActivation('latex-workshop.build')
        })
    })

    runTestWithFixture('fixture058', 'build main.tex when main.tex not in root dir and subfile opened', async (findRootFileEnd) => {
        const fixtureDir = getFixtureDir()
        const texFileName = 's.tex'
        const pdfFileName = 'main.pdf'
        const pdfFilePath = path.join(fixtureDir, 'main', pdfFileName)
        const mainTexFilePath = vscode.Uri.file(path.join(fixtureDir, 'main', 'main.tex'))
        const mainDoc = await vscode.workspace.openTextDocument(mainTexFilePath)
        await vscode.window.showTextDocument(mainDoc)
        await findRootFileEnd
        await assertPdfIsGenerated(pdfFilePath, async () => {
            const texFilePath = vscode.Uri.file(path.join(fixtureDir, 'sub', texFileName))
            const doc = await vscode.workspace.openTextDocument(texFilePath)
            await vscode.window.showTextDocument(doc)
            await executeVscodeCommandAfterActivation('latex-workshop.build')
        })
    })

    runTestWithFixture('fixture059', 'build main.tex choosing it in QuickPick', async (findRootFileEnd) => {
        const fixtureDir = getFixtureDir()
        const texFileName = 's.tex'
        const pdfFileName = 'main.pdf'
        const pdfFilePath = path.join(fixtureDir, pdfFileName)
        await assertPdfIsGenerated(pdfFilePath, async () => {
            const texFilePath = vscode.Uri.file(path.join(fixtureDir, 'sub', texFileName))
            const doc = await vscode.workspace.openTextDocument(texFilePath)
            await vscode.window.showTextDocument(doc)
            await findRootFileEnd
            await sleep(1000)
            await execCommandThenPick(
                () => vscode.commands.executeCommand('latex-workshop.build'),
                () => vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem')
            )
        })
    })

    runTestWithFixture('fixture05a', 'build s.tex choosing it in QuickPick', async (findRootFileEnd) => {
        const fixtureDir = getFixtureDir()
        const texFileName = 's.tex'
        const pdfFileName = 's.pdf'
        const pdfFilePath = path.join(fixtureDir, 'sub', pdfFileName)
        await assertPdfIsGenerated(pdfFilePath, async () => {
            const texFilePath = vscode.Uri.file(path.join(fixtureDir, 'sub', texFileName))
            const doc = await vscode.workspace.openTextDocument(texFilePath)
            await vscode.window.showTextDocument(doc)
            await findRootFileEnd
            await sleep(1000)
            await execCommandThenPick(
                () => vscode.commands.executeCommand('latex-workshop.build'),
                async () => {
                    await vscode.commands.executeCommand('workbench.action.quickOpenSelectNext')
                    await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem')
                    return undefined
                }
            )
        })
    })

    runTestWithFixture('fixture05b', 'build a subfile with extra input file', async (findRootFileEnd) => {
        const fixtureDir = getFixtureDir()
        const texFileName = 's.tex'
        const pdfFileName = 's.pdf'
        const pdfFilePath = path.join(fixtureDir, 'sub', 'out', pdfFileName)
        await assertPdfIsGenerated(pdfFilePath, async () => {
            const texFilePath = vscode.Uri.file(path.join(fixtureDir, 'sub', texFileName))
            const doc = await vscode.workspace.openTextDocument(texFilePath)
            await vscode.window.showTextDocument(doc)
            await findRootFileEnd
            await executeVscodeCommandAfterActivation('latex-workshop.build')
        })
    })

    //
    // Build with makeindex
    //
    runTestWithFixture('fixture060', 'basic build with makeindex', async (findRootFileEnd) => {
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
    })

    //
    // Recipe tests
    //
    runTestWithFixture('fixture100', 'test q/.../ on Windows', async (findRootFileEnd) => {
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
    }, () => os.platform() !== 'win32')

    runTestWithFixture('fixture101', 'test q/.../ with spaces in outdir on Windows', async (findRootFileEnd) => {
        const fixtureDir = getFixtureDir()
        const texFileName = 't.tex'
        const pdfFileName = 't.pdf'
        const pdfFilePath = path.join(fixtureDir, 'out dir', pdfFileName)
        await assertPdfIsGenerated(pdfFilePath, async () => {
            const texFilePath = vscode.Uri.file(path.join(fixtureDir, texFileName))
            const doc = await vscode.workspace.openTextDocument(texFilePath)
            await vscode.window.showTextDocument(doc)
            await findRootFileEnd
            await executeVscodeCommandAfterActivation('latex-workshop.build')
        })
    }, () => os.platform() !== 'win32')

    runTestWithFixture('fixture102', 'test copy on Windows', async (findRootFileEnd) => {
        const fixtureDir = getFixtureDir()
        const texFileName = 't.tex'
        const pdfFileName = 'b.pdf'
        const pdfFilePath = path.join(fixtureDir, 'out dir', pdfFileName)
        await assertPdfIsGenerated(pdfFilePath, async () => {
            const texFilePath = vscode.Uri.file(path.join(fixtureDir, texFileName))
            const doc = await vscode.workspace.openTextDocument(texFilePath)
            await vscode.window.showTextDocument(doc)
            await findRootFileEnd
            await executeVscodeCommandAfterActivation('latex-workshop.build')
        })
    }, () => os.platform() !== 'win32')

})
