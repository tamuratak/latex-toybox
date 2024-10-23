import * as assert from 'node:assert'
import * as path from 'node:path'
import { getFixtureDir, runUnitTestWithFixture } from '../../../utils/ciutils.js'
import { FakeLogger } from '../../../utils/fakecomponents.js'
import { SyncTexJs } from '../../../../src/components/locatorlib/synctex.js'
import { inspect } from 'node:util'


suite('unit test suite', () => {

    suiteSetup(() => undefined)

    runUnitTestWithFixture('fixture001', 'test synctex', () => {
        const fixtureDir = getFixtureDir()
        const pdfFilePath = path.join(fixtureDir, 'synctexjs', 't.pdf')
        const fakeExtension = {
            logger: new FakeLogger()
        }
        const synctexjs = new SyncTexJs(fakeExtension)
        const ret = synctexjs.parseSyncTexForPdf(pdfFilePath)
        const output = inspect(ret, {showHidden: true})
        // console.log(output)
        assert.ok(output)
    })

})
