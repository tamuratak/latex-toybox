import * as assert from 'assert'
import * as path from 'path'

import * as vscode from 'vscode'

import {
    getFixtureDir,
    runTestWithFixture,
    waitLatexWorkshopActivated,
    promisify,
    sleep
} from './utils/ciutils'

suite('RootFile test suite', () => {

    suiteSetup(() => {
        // noop
    })

    runTestWithFixture('fixture001', 'import package', async () => {
        const fixtureDir = getFixtureDir()
        const texFileName = 'abc/lmn/uvw/two.tex'
        const mainFileName = 'main.tex'
        const texFilePath = vscode.Uri.file(path.join(fixtureDir, texFileName))
        const doc = await vscode.workspace.openTextDocument(texFilePath)
        await sleep(1000)
        const rootFileFound = promisify('findrootfileend')
        await vscode.window.showTextDocument(doc)
        const extension = await waitLatexWorkshopActivated()
        await rootFileFound
        console.log(`rootFile: ${extension.exports.realExtension?.manager.rootFile}`)
        assert.strictEqual(extension.exports.realExtension?.manager.rootFile, path.join(fixtureDir, mainFileName))
    })

    runTestWithFixture('fixture002', 'circular inclusion', async () => {
        const fixtureDir = getFixtureDir()
        const aFileName = 'a.tex'
        const pooFileName = 'poo.tex'
        const mainFileName = 'main.tex'
        const aTexFilePath = vscode.Uri.file(path.join(fixtureDir, aFileName))
        const rootFileFound = promisify('findrootfileend')
        const doc = await vscode.workspace.openTextDocument(aTexFilePath)
        await vscode.window.showTextDocument(doc)
        const extension = await waitLatexWorkshopActivated()
        await rootFileFound
        console.log(`rootFile: ${extension.exports.realExtension?.manager.rootFile}`)
        assert.strictEqual(extension.exports.realExtension?.manager.rootFile, path.join(fixtureDir, mainFileName))
        await sleep(2000)
        if (extension.exports.realExtension) {
            extension.exports.realExtension.manager.rootFile = undefined
            await extension.exports.realExtension?.manager.findRoot()
            const includedTeX = extension.exports.realExtension.manager.getIncludedTeX()
            console.log(`rootFile: ${extension.exports.realExtension?.manager.rootFile}`)
            console.log(JSON.stringify(includedTeX))
            const expetedArray = [path.join(fixtureDir, aFileName), path.join(fixtureDir, pooFileName), path.join(fixtureDir, mainFileName)]
            assert.ok(expetedArray.every((filePath) => includedTeX.includes(filePath)))
        } else {
            assert.fail('Real extension is undefined.')
        }
    })

})
