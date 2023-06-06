import assert from 'assert'

import { AuxLexer } from '../../../../src/components/auxparserlib/auxlexer'
import { runUnitTestWithFixture } from '../../../utils/ciutils'
import { AuxParser } from '../../../../src/components/auxparserlib/auxparser'


suite('unit test suite: auxparser', () => {

    runUnitTestWithFixture('fixture001', 'test auxparser', () => {
        const lexer = new AuxLexer('\\abc{e}{f}{g} a b c {a}')
        const parser = new AuxParser(lexer)
        const ast = parser.parse()
        assert.strictEqual(ast.length, 6)
        assert.strictEqual(ast[0].value, '\\abc')
        assert.strictEqual(ast[4].value, ' a b c ')
    })

    runUnitTestWithFixture('fixture001', 'test auxparser', () => {
        const lexer = new AuxLexer('\\abc{{e}{f}}{g} a b c {a}')
        const parser = new AuxParser(lexer)
        const ast = parser.parse()
        assert.strictEqual(ast.length, 5)
        assert.strictEqual(ast[1].value.length, 2)
        const ast1 = ast[1]
        assert.strictEqual(ast1.type, 'group')
        assert.strictEqual(ast1.value.length, 2)
        assert.strictEqual(ast[3].value, ' a b c ')
    })

})
