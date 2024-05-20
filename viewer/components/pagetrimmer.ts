import type { ILatexToyboxPdfViewer, IPDFViewerApplication } from './interface.js'

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

function getTrimScale() {
    if (trimSelectElement.selectedIndex <= 0) {
        return 1.0
    }
    const trimValue = trimSelectElement.options[trimSelectElement.selectedIndex]?.value
    if (trimValue === undefined) {
        throw new Error('trimValue is undefined')
    }
    return 1.0 / (1 - 2 * Number(trimValue))
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
        // Dispatch the change event, which resizes each page, which triggers MutationObserver on each page,
        // then resetTrim() will be called on each page.
        scaleSelectElement.dispatchEvent(changeEvent)
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
        // Dispatch the change event, which resizes each page, which triggers MutationObserver on each page,
        // then trimPage() will be called on each page.
        scaleSelectElement.dispatchEvent(changeEvent)
    }
})

function resetTrim(page: HTMLElement) {
    // Since canvas element on the page is recreated when the page is resized,
    // we don't have to reset the properties of the canvas element.
    page.style.overflow = ''
    const textLayer = page.getElementsByClassName('textLayer')[0] as HTMLElement
    const annotationLayer = page.getElementsByClassName('annotationLayer')[0] as HTMLElement
    if (textLayer && textLayer.style) {
        textLayer.style.left = ''
    }
    if (annotationLayer && annotationLayer.style) {
        annotationLayer.style.left = ''
    }
}

function trimPage(page: HTMLElement) {
    const trimScale = getTrimScale()
    const textLayer = page.getElementsByClassName('textLayer')[0] as HTMLElement
    const annotationLayer = page.getElementsByClassName('annotationLayer')[0] as HTMLElement
    const canvas = page.getElementsByTagName('canvas')[0]
    if (!canvas) {
        return
    }
    // This hides the left part of each element on the page.
    page.style.overflow = 'hidden'
    const canvasWidth = canvas.style.width.replace('px', '')
    // Move each element on the page slightly to the left.
    const offsetX = - Number(canvasWidth) * (1 - 1 / trimScale) / 2
    canvas.style.left = offsetX + 'px'
    canvas.style.position = 'relative'
    if (textLayer) {
        if (textLayer.style) {
            textLayer.style.left = offsetX + 'px'
        } else {
            (textLayer.style as any) = `offset: ${offsetX}px;`
        }
    }
    if (annotationLayer) {
        if (annotationLayer.style) {
            annotationLayer.style.left = offsetX + 'px'
        } else {
            (annotationLayer.style as any) = `offset: ${offsetX}px;`
        }
    }
}

function setObserverToTrim() {
    const observer = new MutationObserver(records => {
        if (trimSelectElement.selectedIndex <= 0) {
            // Undo trim
            records.forEach(record => {
                const page = record.target as HTMLElement
                resetTrim(page)
            })
        } else {
            // Do trim
            records.forEach(record => {
                const page = record.target as HTMLElement
                trimPage(page)
            })
        }
    })
    for (const page of viewerDivElement.getElementsByClassName('page') as HTMLCollectionOf<HTMLElement>) {
        if (page.dataset['isObserved'] !== 'observed') {
            observer.observe(page, { attributes: true, childList: true, attributeFilter: ['style'] })
            page.setAttribute('data-is-observed', 'observed')
        }
    }
}

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

export class PageTrimmer {
    private readonly lwApp: ILatexToyboxPdfViewer

    constructor(lwApp: ILatexToyboxPdfViewer) {
        this.lwApp = lwApp
        // Set observers after a pdf file is loaded in the first time.
        this.lwApp.lwEventBus.onPagesLoaded(setObserverToTrim, { once: true })
        // Skip the first loading
        this.lwApp.lwEventBus.onPagesInit(() => {
            // Set observers each time a pdf file is refresed.
            this.lwApp.lwEventBus.onPagesInit(setObserverToTrim)
        }, { once: true })

        this.lwApp.lwEventBus.onPagesLoaded(() => {
            if (trimSelectElement.selectedIndex > 0) {
                for (const page of viewerDivElement.getElementsByClassName('page') as HTMLCollectionOf<HTMLElement>) {
                    trimPage(page)
                }
            }
        })
    }

    get originalPdfViewerCurrentScaleValue() {
        return originalPdfViewerCurrentScaleValue
    }
}
