import assert from 'assert'
import { latexParser } from 'latex-utensils'

import { UtensilsParser } from '../../../src/components/parser/syntax'
import { getContentRange } from '../../../src/utils/ast'
import { runUnitTestWithFixture } from '../../utils/ciutils'

const pegParser = new UtensilsParser()

suite('unit test suite: utils/ast', () => {

    suiteTeardown(() => {
        return pegParser.dispose()
    })

    runUnitTestWithFixture('fixture001', 'test getContentRange with $\\biggl(abc\\biggr)$', async () => {
        const docString = '$\\biggl(abc\\biggr)$'
        const cursorPos = { line: 1, column: '$\\biggl('.length+2 }
        const ast = await pegParser.parseLatex(docString, { enableMathCharacterLocation: true })
        assert(ast)
        if (ast) {
            const result = latexParser.findNodeAt(ast.content, cursorPos)
            assert(result)
            if (result) {
                const range = getContentRange(result, docString)
                assert(range)
                if (range) {
                    assert.strictEqual(
                        docString.substring(range.start.character, range.end.character),
                        'abc'
                    )
                }
            }
        }
    })

    runUnitTestWithFixture('fixture001', 'test getContentRange with $\\biggl\\{abc\\biggr\\}$', async () => {
        const docString = '$\\biggl\\{abc\\biggr\\}$'
        const cursorPos = { line: 1, column: '$\\biggl\\{'.length+2 }
        const ast = await pegParser.parseLatex(docString, { enableMathCharacterLocation: true })
        assert(ast)
        if (ast) {
            const result = latexParser.findNodeAt(ast.content, cursorPos)
            assert(result)
            if (result) {
                const range = getContentRange(result, docString)
                assert(range)
                if (range) {
                    assert.strictEqual(
                        docString.substring(range.start.character, range.end.character),
                        'abc'
                    )
                }
            }
        }
    })

    runUnitTestWithFixture('fixture001', 'test getContentRange with $\\left(abc\\right)$', async () => {
        const docString = '$\\left(abc\\right)$'
        const cursorPos = { line: 1, column: '$\\left('.length+2 }
        const ast = await pegParser.parseLatex(docString, { enableMathCharacterLocation: true })
        assert(ast)
        if (ast) {
            const result = latexParser.findNodeAt(ast.content, cursorPos)
            assert(result)
            if (result) {
                const range = getContentRange(result, docString)
                assert(range)
                if (range) {
                    assert.strictEqual(
                        docString.substring(range.start.character, range.end.character),
                        'abc'
                    )
                }
            }
        }
    })

    runUnitTestWithFixture('fixture001', 'test getContentRange with \\begin{aaa}abc\\end{aaa}', async () => {
        const docString = '\\begin{aaa}abc\\end{aaa}'
        const cursorPos = { line: 1, column: '\\begin{aaa}'.length+2 }
        const ast = await pegParser.parseLatex(docString, { enableMathCharacterLocation: true })
        assert(ast)
        if (ast) {
            const result = latexParser.findNodeAt(ast.content, cursorPos)
            assert(result)
            if (result) {
                const range = getContentRange(result, docString)
                assert(range)
                if (range) {
                    assert.strictEqual(
                        docString.substring(range.start.character, range.end.character),
                        'abc'
                    )
                }
            }
        }
    })

})
