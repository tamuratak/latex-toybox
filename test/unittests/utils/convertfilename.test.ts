import assert from 'assert'
import { ConvertFilenameEncodingIterator, iconvLiteSupportedEncodings } from '../../../src/utils/convertfilename'
import { runUnitTestWithFixture } from '../../utils/ciutils'

suite('unit test suite: utils/convertfilename.ts', () => {
    runUnitTestWithFixture('fixture001', 'test runnerutils', () => {
        assert.strictEqual(
            Array.from(new ConvertFilenameEncodingIterator('/abc/test')).length,
            iconvLiteSupportedEncodings.length
        )
    })
})
