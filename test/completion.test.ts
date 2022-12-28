import * as assert from 'assert'
import * as os from 'os'
import * as path from 'path'

import * as vscode from 'vscode'

import {
    getFixtureDir,
    obtainLatexWorkshop,
    runTestWithFixture,
    sleep
} from './utils/ciutils'


function assertCompletionItemContainsSnippet(items: vscode.CompletionItem[], prefix: string, snippet: string): void {
    const matches = items.find(item =>
        item.label === prefix &&
        item.insertText instanceof vscode.SnippetString &&
        item.insertText.value === snippet)
    assert.ok(matches !== undefined, `Snippet (${prefix}, ${snippet}) not found`)
}

function assertCompletionItemDoesNotContainSnippet(items: vscode.CompletionItem[], prefix: string, snippet?: string): void {
    if (snippet) {
        const matches = items.find(item =>
            item.label === prefix &&
            item.insertText instanceof vscode.SnippetString &&
            item.insertText.value === snippet)
        assert.ok(matches === undefined, `Snippet (${prefix}, ${snippet}) found`)
    } else {
        const matches = items.find(item => item.label === prefix)
        assert.ok(matches === undefined, `Snippet ${prefix} found`)
    }
}

function assertCompletionItemContains(items: vscode.CompletionItem[], label: string, detail: string): void {
    const matches = items.find(item =>
        item.label === label &&
        item.detail === detail)
    assert.ok(matches !== undefined, `Snippet (${label}, ${detail}) not found`)
}

suite('Completion test suite', () => {

    suiteSetup(() => {
        // noop
    })

    runTestWithFixture('fixture001', 'basic completion', async (findRootFileEnd) => {
        const fixtureDir = getFixtureDir()
        const texFileName = 't.tex'
        const texFilePath = vscode.Uri.file(path.join(fixtureDir, texFileName))
        const doc = await vscode.workspace.openTextDocument(texFilePath)
        await vscode.window.showTextDocument(doc)
        await findRootFileEnd
        await sleep(1000)
        const extension = obtainLatexWorkshop()
        const pos = new vscode.Position(3,1)
        const token = new vscode.CancellationTokenSource().token
        const items = extension.exports.realExtension?.completer.provideCompletionItems?.(
            doc, pos, token,
            {
                triggerKind: vscode.CompletionTriggerKind.Invoke,
                triggerCharacter: undefined
            }
        )
        assert.ok(items && items.length > 0)
    })

    runTestWithFixture('fixture002', '@-snippet completion', async (findRootFileEnd) => {
        const fixtureDir = getFixtureDir()
        const texFileName = 't.tex'
        const texFilePath = vscode.Uri.file(path.join(fixtureDir, texFileName))
        const doc = await vscode.workspace.openTextDocument(texFilePath)
        await vscode.window.showTextDocument(doc)
        const extension = obtainLatexWorkshop()
        await findRootFileEnd
        await sleep(1000)
        const pos = new vscode.Position(3,1)
        const token = new vscode.CancellationTokenSource().token
        const items = extension.exports.realExtension?.atSuggestionCompleter.provideCompletionItems(
            doc, pos, token,
            {
                triggerKind: vscode.CompletionTriggerKind.Invoke,
                triggerCharacter: undefined
            }
        )
        if (!items) {
            assert.fail('No realExtension')
        }
        assert.notStrictEqual(items.length, 0)
        assertCompletionItemContainsSnippet(items, '@+', '\\sum')
        assertCompletionItemDoesNotContainSnippet(items, '@+', '\\bigcup')
        assertCompletionItemContainsSnippet(items, '@M', '\\sum')
        assertCompletionItemDoesNotContainSnippet(items, '@8')
    })

    runTestWithFixture('fixture003', '@-snippet completion with trigger #', async (findRootFileEnd) => {
        const fixtureDir = getFixtureDir()
        const texFileName = 't.tex'
        const texFilePath = vscode.Uri.file(path.join(fixtureDir, texFileName))
        const doc = await vscode.workspace.openTextDocument(texFilePath)
        await vscode.window.showTextDocument(doc)
        const extension = obtainLatexWorkshop()
        await findRootFileEnd
        await sleep(1000)
        const pos = new vscode.Position(3,1)
        const token = new vscode.CancellationTokenSource().token
        const items = extension.exports.realExtension?.atSuggestionCompleter.provideCompletionItems(
            doc, pos, token,
            {
                triggerKind: vscode.CompletionTriggerKind.Invoke,
                triggerCharacter: undefined
            }
        )
        if (!items) {
            assert.fail('No realExtension')
        }
        assert.notStrictEqual(items.length, 0)
        assertCompletionItemContainsSnippet(items, '#+', '\\sum')
        assertCompletionItemContainsSnippet(items, '#ve', '\\varepsilon')
        assertCompletionItemDoesNotContainSnippet(items, '@+', '\\bigcup')
        assertCompletionItemDoesNotContainSnippet(items, '#+', '\\bigcup')
        assertCompletionItemDoesNotContainSnippet(items, '#8')
    })

    runTestWithFixture('fixture004', 'glossary completion', async (findRootFileEnd) => {
        const fixtureDir = getFixtureDir()
        const texFileName = 't.tex'
        const texFilePath = vscode.Uri.file(path.join(fixtureDir, texFileName))
        const doc = await vscode.workspace.openTextDocument(texFilePath)
        await vscode.window.showTextDocument(doc)
        const extension = obtainLatexWorkshop()
        await findRootFileEnd
        await sleep(1000)
        const pos = new vscode.Position(6,5)
        const token = new vscode.CancellationTokenSource().token
        await sleep(2000)
        const items = extension.exports.realExtension?.completer.provideCompletionItems(
            doc, pos, token,
            {
                triggerKind: vscode.CompletionTriggerKind.Invoke,
                triggerCharacter: undefined
            }
        )
        if (!items) {
            assert.fail('No realExtension')
        }
        assert.strictEqual(items.length, 7)
        assertCompletionItemContains(items, 'rf', 'radio-frequency')
        assertCompletionItemContains(items, 'te', 'Transverse Magnetic')
        assertCompletionItemContains(items, 'E_P', 'Elastic $\\varepsilon$ toto')
        assertCompletionItemContains(items, 'lw', 'What this extension is $\\mathbb{A}$')
        assertCompletionItemContains(items, 'vs_code', 'Editor')
        assertCompletionItemContains(items, 'abbr_y', 'A second abbreviation')
        assertCompletionItemContains(items, 'abbr_x', 'A first abbreviation')
    }, () => os.platform() === 'win32' || os.platform() === 'darwin')
})
