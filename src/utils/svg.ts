import { encodeToBase64 } from './base64.js'

export function svgToDataUrl(xml: string): string {
    const svg64 = encodeToBase64(xml)
    const b64Start = 'data:image/svg+xml;base64,'
    return b64Start + svg64
}
