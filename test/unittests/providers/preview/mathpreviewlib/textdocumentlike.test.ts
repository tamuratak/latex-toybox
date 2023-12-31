import assert from 'node:assert'
import * as path from 'node:path'
import * as vscode from 'vscode'

import {runUnitTestWithFixture, getFixtureDir} from '../../../../utils/ciutils.js'
import {ITextDocumentLike, TextDocumentLike} from '../../../../../src/components/mathpreviewlib/textdocumentlike.js'

suite('unit test suite: mathpreviewlib/textdocumentlike', () => {

    runUnitTestWithFixture('fixture001', 'test load and getWordRangeAtPosition', async () => {
        const s =
`abc
d

efg

hijk
lmn
`
        const fixtureDir = getFixtureDir()
        const filePath = path.join(fixtureDir, 'textdocumentlike', 'abc.txt')
        const a = await TextDocumentLike.load(filePath)
        assert.strictEqual(s, a.getText())

        const docLike = new TextDocumentLike(s)
        const pos = new vscode.Position(0,0)
        assert.strictEqual('abc', docLike.lineAt(pos.line).text)
        assert.strictEqual('abc', docLike.lineAt(pos).text)
        let range = docLike.getWordRangeAtPosition(pos)
        assert.strictEqual('abc', docLike.getText(range))
        range = docLike.getWordRangeAtPosition(new vscode.Position(1, 0))
        assert.strictEqual('d', docLike.getText(range))
        range = docLike.getWordRangeAtPosition(new vscode.Position(2, 0))
        assert.strictEqual(undefined, range)
    })

    runUnitTestWithFixture('fixture001', 'test TextDocument is assignable to ITextDocumentLike', () => {
        let doc: vscode.TextDocument | undefined
        const a: ITextDocumentLike | undefined = doc
        assert(!a)
    })

})
