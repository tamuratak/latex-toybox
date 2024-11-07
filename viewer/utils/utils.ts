import { decodePath, pdfFilePrefix } from './encodepdffilepath.js'

export const isEmbedded = window.parent !== window

export function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

export function isPrefersColorSchemeDark() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function isPdfjsShortcut(e: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'code' | 'key'>) {
    // exclusive or
    const ctrlKey = (e.ctrlKey && !e.metaKey) || (!e.ctrlKey && e.metaKey)
    if (!ctrlKey && !e.altKey && !e.shiftKey) {
        if (/^[ njpkrhs]$/.exec(e.key)) {
            return true
        }
        if (/^(Enter|Home|End|PageUp|PageDown|ArrowUp|ArrowLeft|ArrowRight|ArrowDown|F4)$/.exec(e.code)) {
            return true
        }
        return false
    }
    // Ctrl
    if (ctrlKey && !e.altKey && !e.shiftKey) {
        if (/^[-+=0f]$/.exec(e.key)) {
            return true
        }
        if ( 'p' === e.key && !isEmbedded ) {
            return true
        }
        return false
    }
    // Ctrl + Shift
    if (ctrlKey && !e.altKey && e.shiftKey) {
        if (/^[g]$/.exec(e.key)) {
            return true
        }
        return false
    }
    // Ctrl + Alt
    if (ctrlKey && e.altKey && !e.shiftKey) {
        if (/^[g]$/.exec(e.key)) {
            return true
        }
        return false
    }
    // Shift
    if (!ctrlKey && !e.altKey && e.shiftKey) {
        if (/^[ r]$/.exec(e.key)) {
            return true
        }
        if (e.code === 'Enter') {
            return true
        }
        return false
    }
    return false
}

export function elementWidth(element: HTMLElement, forceDisplay = true): number {
    const originalDisplay = element.style.display
    if (forceDisplay) {
        element.style.display = 'block'
    }
    const style = window.getComputedStyle(element)
    const width = element.offsetWidth
    const margin = parseFloat(style.marginLeft) + parseFloat(style.marginRight)
    if (forceDisplay) {
        element.style.display = originalDisplay
    }
    return width + margin
}

export function decodeQuery() {
    const params = new URLSearchParams(window.location.search)
    for (const [key, value] of params) {
        if (key && value && key.toLowerCase() === 'file') {
            const encodedPdfFilePath = value.replace(pdfFilePrefix, '')
            const pdfFileUri = decodePath(encodedPdfFilePath)
            const documentTitle = pdfFileUri.split(/[\\/]/).pop()
            return {encodedPdfFilePath, pdfFileUri, documentTitle}
        }
    }
    throw new Error('file not given in the query.')
}

