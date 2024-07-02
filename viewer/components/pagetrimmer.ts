import type { IPDFViewerApplication } from './interface.js'

declare const PDFViewerApplication: IPDFViewerApplication

let pdfViewerCurrentScale: number | undefined
let originalSelectedIndex: number | undefined
// 'page-width' and others
let originalPdfViewerCurrentScaleValue: string | undefined

// Static HTML elements
const trimSelectElement = document.getElementById('trimSelect') as HTMLSelectElement
const scaleSelectElement = document.getElementById('scaleSelect') as HTMLSelectElement
// an option in the scaleSelect element
const trimOptionElement = document.getElementById('trimOption') as HTMLOptionElement
const viewerDivElement = document.getElementById('viewer') as HTMLElement

const trimRule005StyleSheet = document.createElement('style')
const trimRule010StyleSheet = document.createElement('style')
const trimRule015StyleSheet = document.createElement('style')

const trimValueAndSheet: [number, HTMLStyleElement][] = [[0.05, trimRule005StyleSheet], [0.10, trimRule010StyleSheet], [0.15, trimRule015StyleSheet]]
trimValueAndSheet.forEach(([trimValue, sheet]) => {
    document.head.appendChild(sheet)
    const left = -100 * trimValue
    sheet.textContent = `
.page canvas {
    left: ${left}%;
    position: relative;
}
.page .textLayer {
    left: ${left}%;
}
.page .annotationLayer {
    left: ${left}%;
}
`
    sheet.disabled = true
})

function disableAllTrimRuleStylesheets() {
    trimRule005StyleSheet.disabled = true
    trimRule010StyleSheet.disabled = true
    trimRule015StyleSheet.disabled = true
}

function enableTrimRuleStylesheet(trimSelectedIndex: number) {
    disableAllTrimRuleStylesheets()
    if (trimSelectedIndex === 1) {
        trimRule005StyleSheet.disabled = false
    } else if (trimSelectedIndex === 2) {
        trimRule010StyleSheet.disabled = false
    } else if (trimSelectedIndex === 3) {
        trimRule015StyleSheet.disabled = false
    }
}

function getTrimScale() {
    const trimSelectedIndex = trimSelectElement.selectedIndex
    if (trimSelectedIndex <= 0) {
        return 1.0
    }
    const trimValue = trimValueAndSheet[trimSelectedIndex - 1]?.[0]
    if (trimValue === undefined) {
        throw new Error('trimValue is undefined. never happen.')
    }
    return 1.0 / (1 - 2 * trimValue)
}

/**
 * We perform trimming in two steps. First, we change the scale of each page with scaleSelectElement.
 * Second, we move all the elements on each page slightly to the left.
 * The right part of each page is hidden with the overflow property of the viewerDivElement.
 *
 * When each page is small relatively to the window size, this feature doesn't look good.
 */
trimSelectElement.addEventListener('change', () => {
    const changeEvent = new Event('change')
    if (trimSelectElement.selectedIndex <= 0) {
        // Undo trim
        viewerDivElement.style.overflow = ''
        for (const opt of scaleSelectElement.options) {
            opt.disabled = false
        }
        trimOptionElement.disabled = true
        trimOptionElement.hidden = true
        if (originalSelectedIndex !== undefined) {
            /**
             * If the original scale is custom, i.e. selectedIndex === 4,
             * we use page-width, i.e. selectedIndex === 3.
             * We don't restore the custom scale.
             */
            if (originalSelectedIndex === 4) {
                scaleSelectElement.selectedIndex = 3
            } else {
                scaleSelectElement.selectedIndex = originalSelectedIndex
            }
        }
        // Dispatch the change event, which resizes each page.
        scaleSelectElement.dispatchEvent(changeEvent)
        disableAllTrimRuleStylesheets()
        pdfViewerCurrentScale = undefined
        originalSelectedIndex = undefined
        originalPdfViewerCurrentScaleValue = undefined
        return
    } else {
        // Do trim
        const trimScale = getTrimScale()
        // This hides the right part of each page.
        viewerDivElement.style.overflow = 'hidden'
        for (const opt of scaleSelectElement.options) {
            opt.disabled = true
        }
        if (pdfViewerCurrentScale === undefined) {
            pdfViewerCurrentScale = PDFViewerApplication.pdfViewer.currentScale
        }
        if (originalSelectedIndex === undefined) {
            originalSelectedIndex = scaleSelectElement.selectedIndex
            originalPdfViewerCurrentScaleValue = PDFViewerApplication.pdfViewer.currentScaleValue
        }
        // Set the calculated scale to scaleSelectElement through trimOptionElement.
        trimOptionElement.value = (pdfViewerCurrentScale * trimScale).toString()
        trimOptionElement.selected = true
        enableTrimRuleStylesheet(trimSelectElement.selectedIndex)
        scaleSelectElement.dispatchEvent(changeEvent)
    }
})

// We have to recalculate scale and left offset for trim mode on each resize event.
window.addEventListener('resize', () => {
    const trimSelectedIndex = trimSelectElement.selectedIndex
    if (trimSelectedIndex <= 0) {
        return
    }
    trimSelectElement.selectedIndex = 0
    const changeEvent = new Event('change')
    trimSelectElement.dispatchEvent(changeEvent)
    trimSelectElement.selectedIndex = trimSelectedIndex
    trimSelectElement.dispatchEvent(changeEvent)
})

export function getOriginalPdfViewerCurrentScaleValue() {
    return originalPdfViewerCurrentScaleValue
}

export function isTrimEnabled() {
    return trimSelectElement.selectedIndex > 0
}
