import { decodeFromBase64Url, encodeToBase64Url } from './base64.js'

/**
 * Prefix that server.ts uses to distiguish requests on pdf files from others.
 * We use '.' because it is not converted by encodeURIComponent and other functions.
 * See https://stackoverflow.com/questions/695438/safe-characters-for-friendly-url
 * See https://tools.ietf.org/html/rfc3986#section-2.3
 */
export const pdfFilePrefix = 'pdf..'

/**
 * We encode the path with base64url.
 * - https://en.wikipedia.org/wiki/Base64#URL_applications
 * - https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/btoa#Unicode_strings
 */
export function encodePath(url: string) {
    const b64url = encodeToBase64Url(url)
    return b64url
}

export function decodePath(b64url: string) {
    const ret = decodeFromBase64Url(b64url)
    return ret
}
