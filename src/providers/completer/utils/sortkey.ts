
// Reverse case of first character and convert to character code
export function reverseCaseOfFirstCharacterAndConvertToHex(label: string): string {
    return label.replace(/^[a-zA-Z]/, c => {
        const n = c.match(/[a-z]/) ? c.toUpperCase().charCodeAt(0): c.toLowerCase().charCodeAt(0)
        return n.toString(16)
    })
}
