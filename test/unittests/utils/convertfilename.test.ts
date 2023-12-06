import assert from 'node:assert'
import { ConvertFilenameEncodingIterator, iconvLiteSupportedEncodings } from '../../../src/utils/convertfilename.js'
import { runUnitTestWithFixture } from '../../utils/ciutils.js'

suite('unit test suite: utils/convertfilename.ts', () => {
    runUnitTestWithFixture('fixture001', 'new ConvertFilenameEncodingIterator', () => {
        assert.strictEqual(
            Array.from(new ConvertFilenameEncodingIterator('/abc/test')).length,
            iconvLiteSupportedEncodings.length
        )
    })
})
