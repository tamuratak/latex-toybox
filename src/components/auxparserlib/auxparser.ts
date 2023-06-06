import { AuxLexer, Position } from './auxlexer'

type Node = {
    type: 'command' | 'string',
    value: string,
    location: {
        start: Position,
        end: Position
    }
} | {
    type: 'group',
    value: Node[],
    location: {
        start: Position,
        end: Position
    }
}

export class AuxParser {
    private readonly lexer: AuxLexer

    constructor(lexer: AuxLexer) {
        this.lexer = lexer
    }

    parse() {
        const ast = this.parseContent()
        if (!this.lexer.isEOF()) {
            const c = this.lexer.peek()
            throw new Error('Unexpected token: ' + c)
        }
        return ast
    }

    private parseContent(): Node[] {
        const ast: Node[] = []
        while (!this.lexer.isEOF() && this.lexer.peek() !== '}') {
            const token = this.lexer.next()
            if (token === undefined) {
                break
            }
            if (token.type === 'command') {
                const node: Node = {
                    type: 'command',
                    value: token.value,
                    location: {
                        start: token.start,
                        end: this.lexer.position()
                    }
                }
                ast.push(node)
            } else if (token.type === 'string') {
                const node: Node = {
                    type: 'string',
                    value: token.value,
                    location: {
                        start: token.start,
                        end: this.lexer.position()
                    }
                }
                ast.push(node)
            } else if (token.type === 'lbrace') {
                const content = this.parseContent()
                const rbrace = this.lexer.next()
                if (rbrace === undefined || rbrace.type !== 'rbrace') {
                    throw new Error('Missing rbrace')
                }
                const node: Node = {
                    type: 'group',
                    value: content,
                    location: {
                        start: token.start,
                        end: this.lexer.position()
                    }
                }
                ast.push(node)
            } else {
                throw new Error(`Unexpected token: ${token.value}`)
            }
        }
        return ast
    }


}
