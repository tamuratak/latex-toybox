import * as assert from 'node:assert'
import * as path from 'node:path'

import * as vscode from 'vscode'

import {
    getFixtureDir,
    runTestWithFixture,
    sleep,
    obtainLatexToybox
} from './utils/ciutils.js'

suite('RootFile test suite', () => {

    suiteSetup(() => {
        // noop
    })

    runTestWithFixture('fixture001', 'import package', async (findRootFileEnd) => {
        const fixtureDir = getFixtureDir()
        const texFileName = 'abc/lmn/uvw/two.tex'
        const mainFileName = 'main.tex'
        const texFilePath = vscode.Uri.file(path.join(fixtureDir, texFileName))
        const doc = await vscode.workspace.openTextDocument(texFilePath)
        await vscode.window.showTextDocument(doc)
        await findRootFileEnd
        const extension = obtainLatexToybox()
        console.log(`rootFile: ${extension.exports.realExtension.manager.rootFile}`)
        assert.strictEqual(extension.exports.realExtension?.manager.rootFile, path.join(fixtureDir, mainFileName))
    })

    runTestWithFixture('fixture002', 'circular inclusion', async (findRootFileEnd) => {
        const fixtureDir = getFixtureDir()
        const aFileName = 'a.tex'
        const pooFileName = 'poo.tex'
        const mainFileName = 'main.tex'
        const aTexFilePath = vscode.Uri.file(path.join(fixtureDir, aFileName))
        const doc = await vscode.workspace.openTextDocument(aTexFilePath)
        await vscode.window.showTextDocument(doc)
        await findRootFileEnd
        const extension = obtainLatexToybox()
        console.log(`rootFile: ${extension.exports.realExtension.manager.rootFile}`)
        assert.strictEqual(extension.exports.realExtension.manager.rootFile, path.join(fixtureDir, mainFileName))
        await sleep(2000)
        const includedTeX = extension.exports.realExtension.manager.getIncludedTeX()
        console.log(`rootFile: ${extension.exports.realExtension.manager.rootFile}`)
        console.log(JSON.stringify(includedTeX))
        const expetedArray = [path.join(fixtureDir, aFileName), path.join(fixtureDir, pooFileName), path.join(fixtureDir, mainFileName)]
        assert.ok(expetedArray.every((filePath) => includedTeX.includes(filePath)))
    })

})
