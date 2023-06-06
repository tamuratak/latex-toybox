import assert from 'assert'

import { AuxLexer } from '../../../../src/components/auxparserlib/auxlexer'
import { runUnitTestWithFixture } from '../../../utils/ciutils'

suite('unit test suite: auxlexer', () => {

    runUnitTestWithFixture('fixture001', 'test auxlexer', () => {
        const lexer = new AuxLexer('a b c {a}')
        assert.strictEqual(lexer.peek(), 'a')
        assert.strictEqual(lexer.next()?.value, 'a b c ')
        assert.strictEqual(lexer.peek(), '{')
        assert.strictEqual(lexer.peek(), '{')
        assert.strictEqual(lexer.next()?.value, '{')
        assert.strictEqual(lexer.next()?.value, 'a')
        assert.strictEqual(lexer.next()?.value, '}')
    })

    runUnitTestWithFixture('fixture001', 'test auxlexer', () => {
        const lexer = new AuxLexer('\\abc \\abc')
        assert.strictEqual(lexer.next()?.value, '\\abc')
        assert.strictEqual(lexer.next()?.value, ' ')
        assert.strictEqual(lexer.next()?.value, '\\abc')
        assert.strictEqual(lexer.next()?.value, undefined)
    })

})
