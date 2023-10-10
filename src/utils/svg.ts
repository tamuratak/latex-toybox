export function svgToDataUrl(xml: string): string {
    const svg64 = Buffer.from(xml).toString('base64')
    const b64Start = 'data:image/svg+xml;base64,'
    return b64Start + svg64
}
