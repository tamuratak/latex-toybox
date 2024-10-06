import { ScaleMode, trimSelectElement, viewerDom } from './constants.js'
import type { IPDFViewerApplication } from './interface.js'

declare const PDFViewerApplication: IPDFViewerApplication

let pdfViewerCurrentScale: number | undefined
let originalSelectedIndex: number | undefined
// 'page-width' and others
let originalPdfViewerCurrentScaleValue: string | undefined

export enum TrimMode {
    NO_TRIM = 0,
    TRIM_05 = 1,
    TRIM_10 = 2,
    TRIM_15 = 3,
}

const trimRule05 = { trimValue: 0.05, sheet: new CSSStyleSheet() } as const
const trimRule10 = { trimValue: 0.10, sheet: new CSSStyleSheet() } as const
const trimRule15 = { trimValue: 0.15, sheet: new CSSStyleSheet() } as const
const trimValueAndSheet = [trimRule05, trimRule10, trimRule15] as const
trimValueAndSheet.forEach(({ trimValue, sheet }) => {
    const left = -100 * trimValue
    sheet.insertRule(`.page canvas { left: ${left}%; position: relative; }`)
    sheet.insertRule(`.page .textLayer { left: ${left}%; }`)
    sheet.insertRule(`.page .annotationLayer { left: ${left}%; }`)
    sheet.disabled = true
    document.adoptedStyleSheets.push(sheet)
})

function disableAllTrimRuleStylesheets() {
    trimRule05.sheet.disabled = true
    trimRule10.sheet.disabled = true
    trimRule15.sheet.disabled = true
}

function enableTrimRuleStylesheet(trimSelectedIndex: number) {
    disableAllTrimRuleStylesheets()
    if (trimSelectedIndex === TrimMode.TRIM_05) {
        trimRule05.sheet.disabled = false
    } else if (trimSelectedIndex === TrimMode.TRIM_10) {
        trimRule10.sheet.disabled = false
    } else if (trimSelectedIndex === TrimMode.TRIM_15) {
        trimRule15.sheet.disabled = false
    }
}

function getTrimScale() {
    if (!isTrimEnabled()) {
        return 1.0
    }
    const trimSelectedIndex = trimSelectElement.selectedIndex
    let trimValue: number
    if (trimSelectedIndex === TrimMode.TRIM_05) {
        trimValue = trimRule05.trimValue
    } else if (trimSelectedIndex === TrimMode.TRIM_10) {
        trimValue = trimRule10.trimValue
    } else if (trimSelectedIndex === TrimMode.TRIM_15) {
        trimValue = trimRule15.trimValue
    } else {
        throw new Error('trimValue is undefined. never happen.')
    }
    return 1.0 / (1 - 2 * trimValue)
}

function registerTrimmer() {
    const scaleSelectElement = document.getElementById('scaleSelect') as HTMLSelectElement
    const trimOptionElement = document.getElementById('trimOption') as HTMLOptionElement
    /**
     * We perform trimming in two steps. First, we change the scale of each page with scaleSelectElement.
     * Second, we move all the elements on each page slightly to the left.
     * The right part of each page is hidden with the overflow property of the viewerDivElement.
     *
     * When each page is small relatively to the window size, this feature doesn't look good.
     */
    trimSelectElement.addEventListener('change', () => {
        const changeEvent = new Event('change')
        if (!isTrimEnabled()) {
            // Undo trim
            viewerDom.style.overflow = ''
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
                if (originalSelectedIndex === ScaleMode.CUSTOM) {
                    scaleSelectElement.selectedIndex = ScaleMode.PAGE_WIDTH
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
            viewerDom.style.overflow = 'hidden'
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
        if (!isTrimEnabled()) {
            return
        }
        const trimSelectedIndex = trimSelectElement.selectedIndex
        trimSelectElement.selectedIndex = TrimMode.NO_TRIM
        const changeEvent = new Event('change')
        trimSelectElement.dispatchEvent(changeEvent)
        trimSelectElement.selectedIndex = trimSelectedIndex
        trimSelectElement.dispatchEvent(changeEvent)
    })
}

registerTrimmer()

export function getOriginalPdfViewerCurrentScaleValue() {
    return originalPdfViewerCurrentScaleValue
}

export function isTrimEnabled() {
    return trimSelectElement.selectedIndex !== TrimMode.NO_TRIM
}
