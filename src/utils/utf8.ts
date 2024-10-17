const decoder = new TextDecoder()
const encoder = new TextEncoder()

export function decodeUtf8(bytes: Uint8Array) {
    return decoder.decode(bytes)
}

export function encodeUtf8(str: string) {
    return encoder.encode(str)
}
