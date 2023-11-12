import {runUnitTestWithFixture} from '../../../../utils/ciutils.js'
import {isTriggerSuggestNeeded} from '../../../../../src/providers/completionlib/commandlib/commandlib.js'
import assert from 'node:assert'


suite('unit test suite: commandlib/commandfinder', () => {

    runUnitTestWithFixture('fixture001', 'test isTriggerSuggestNeeded', () => {
        assert.ok(!isTriggerSuggestNeeded('frac'))
    })

})
