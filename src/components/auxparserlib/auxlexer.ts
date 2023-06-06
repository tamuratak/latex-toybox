type Token = {
    type: 'command' | 'string' | 'lbrace' | 'rbrace',
    value: string,
    start: Position
}

export type Position = {
    line: number,
    character: number,
    offset: number
}

export class AuxLexer {
    private readonly input: string
    private offset = 0
    private line = 0
    private character = 0

    constructor(input: string) {
        this.input = input
    }

    position(): Position {
        return {
            line: this.line,
            character: this.character,
            offset: this.offset
        }
    }

    isEOF(): boolean {
        return this.offset >= this.input.length
    }

    peek() {
        return this.peekChar()?.c
    }

    next(): Token | undefined {
        const char = this.peekChar()
        if (char === undefined) {
            return undefined
        }
        const {c, start} = char
        this.incPos()
        if (c === '{') {
            return { type: 'lbrace', value: c, start }
        } else if (c === '}') {
            return { type: 'rbrace', value: c, start }
        } else if (c === '\\') {
            const value = c + this.readCommandName()
            return { type: 'command', value, start }
        } else {
            const value = c + this.readString()
            return { type: 'string', value, start }
        }
    }

    private incPos() {
        const char = this.peekChar()
        if (char === undefined) {
            return
        }
        const {c} = char
        if (c === '\n') {
            this.offset++
            this.line++
            this.character = 0
        } else {
            this.offset++
            this.character++
        }
    }

    private readCommandName(): string {
        let command = ''
        let char = this.peekChar()
        while (char) {
            const {c} = char
            if (!/[a-zA-Z@]/.test(c) && command.length > 0) {
                break
            }
            command += c
            this.incPos()
            char = this.peekChar()
        }
        return command
    }

    private readString(): string {
        let str = ''
        let char = this.peekChar()
        while (char) {
            const {c} = char
            if (c === '{' || c === '}' || c === '\\') {
                break
            }
            str += c
            this.incPos()
            char = this.peekChar()
        }
        return str
    }

    private peekChar() {
        const c = this.input[this.offset]
        if (c === undefined) {
            return undefined
        } else {
            return {
                c,
                start: this.position()
            }
        }
    }

}
