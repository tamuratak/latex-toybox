import assert from 'node:assert'
import { encodeToBase64 } from '../../../src/utils/base64.js'

import { runUnitTestWithFixture } from '../../utils/ciutils.js'

suite('unit test suite: utils/base64.ts', () => {
    runUnitTestWithFixture('fixture001', 'test encodeToBase64', () => {
        const kanji = '漢字'
        assert.strictEqual(
            encodeToBase64(kanji),
            Buffer.from(kanji).toString('base64')
        )
    })
})
