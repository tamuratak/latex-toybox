const decoder = initializeDecoder()

function initializeDecoder() {
    try {
        return new TextDecoder('x-user-defined')
    } catch (_) {
        return
    }
}

// https://encoding.spec.whatwg.org/#x-user-defined
// https://en.wikipedia.org/wiki/Character_encodings_in_HTML#cite_note-34
export function decode(bytes: Uint8Array) {
    if (decoder) {
        return decoder.decode(bytes)
    } else {
        return Array.from(bytes).map((byte) => {
            if (byte < 0x80) {
                return String.fromCharCode(byte)
            } else {
                return String.fromCharCode(0xF780 + byte - 0x80)
            }
        }).join('')
    }
}

export function encode(str: string) {
    const array = str.split('').map((char, index) => {
        const code = char.charCodeAt(0)
        if (code < 0x80) {
            return code
        } else {
            if (0xF780 <= code && code <= 0xF7FF) {
                return code - 0xF780 + 0x80
            } else {
                throw new Error(`Unknown code: ${code} at ${index}`)
            }
        }
    })
    return new Uint8Array(array)
}
