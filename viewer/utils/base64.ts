const encoder = new TextEncoder()
/**
 * Copy from https://developer.mozilla.org/en-US/docs/Glossary/Base64#the_unicode_problem
 */
export function encodeToBase64(str: string) {
    const bytes = encoder.encode(str)
    const binString = String.fromCodePoint(...bytes)
    return globalThis.btoa(binString)
}

const decoder = new TextDecoder()
/**
 * Copy from https://developer.mozilla.org/en-US/docs/Glossary/Base64#the_unicode_problem
 */
export function decodeFromBase64(base64: string) {
    const binString = globalThis.atob(base64)
    const bytes = Uint8Array.from(binString, (m) => {
        const result = m.codePointAt(0)
        if (result === undefined) {
            throw new Error('Invalid base64 string')
        }
        return result
    })
    return decoder.decode(bytes)
}

export function encodeToBase64Url(str: string) {
    return encodeToBase64(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

export function decodeFromBase64Url(b64url: string) {
    // Notice that we need 0 repeat if b64url.length % 4 === 0.
    const tmp = b64url + '='.repeat((4 - b64url.length % 4) % 4)
    const b64 = tmp.replace(/-/g, '+').replace(/_/g, '/')
    return decodeFromBase64(b64)
}
