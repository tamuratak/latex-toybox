import type { ILatexWorkshopPdfViewer, IPDFViewerApplication } from './interface.js'

declare const PDFViewerApplication: IPDFViewerApplication

let pdfViewerCurrentScale: number | undefined
let originalSelectedIndex: number | undefined
// 'page-width' and others
let originalPdfViewerCurrentScaleValue: string | undefined

function getTrimScale() {
    const trimSelect = document.getElementById('trimSelect') as HTMLSelectElement
    if (trimSelect.selectedIndex <= 0) {
        return 1.0
    }
    const trimValue = trimSelect.options[trimSelect.selectedIndex].value
    return 1.0 / (1 - 2 * Number(trimValue))
}


(document.getElementById('trimSelect') as HTMLElement).addEventListener('change', () => {
    const trimScale = getTrimScale()
    const trimSelect = document.getElementById('trimSelect') as HTMLSelectElement
    const scaleSelect = document.getElementById('scaleSelect') as HTMLSelectElement
    const changeEvent = new Event('change')
    if (trimSelect.selectedIndex <= 0) {
        for (const opt of scaleSelect.options) {
            opt.disabled = false
        }
        (document.getElementById('trimOption') as HTMLOptionElement).disabled = true;
        (document.getElementById('trimOption') as HTMLOptionElement).hidden = true
        if (originalSelectedIndex !== undefined) {
            /**
             * If the original scale is custom, selectedIndex === 4,
             * we use page-width, selectedIndex === 3.
             * We don't restore the custom scale.
             */
            if (originalSelectedIndex === 4) {
                scaleSelect.selectedIndex = 3
            } else {
                scaleSelect.selectedIndex = originalSelectedIndex
            }
        }
        scaleSelect.dispatchEvent(changeEvent)
        pdfViewerCurrentScale = undefined
        originalSelectedIndex = undefined
        originalPdfViewerCurrentScaleValue = undefined
        return
    }
    for (const opt of scaleSelect.options) {
        opt.disabled = true
    }
    if (pdfViewerCurrentScale === undefined) {
        pdfViewerCurrentScale = PDFViewerApplication.pdfViewer.currentScale
    }
    if (originalSelectedIndex === undefined) {
        originalSelectedIndex = scaleSelect.selectedIndex
        originalPdfViewerCurrentScaleValue = PDFViewerApplication.pdfViewer.currentScaleValue
    }
    const opt = document.getElementById('trimOption') as HTMLOptionElement
    // Set the value as one of the options of the scaleSelect element.
    opt.value = (pdfViewerCurrentScale * trimScale).toString()
    opt.selected = true
    scaleSelect.dispatchEvent(changeEvent)
})

function resetTrim(page: HTMLElement) {
    page.style.overflow = ''
    page.classList.remove('scalePageWidth')
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
    const canvasWrapper = page.getElementsByClassName('canvasWrapper')[0] as HTMLElement
    const annotationLayer = page.getElementsByClassName('annotationLayer')[0] as HTMLElement
    const canvas = page.getElementsByTagName('canvas')[0]
    if (!canvasWrapper || !canvas) {
        if (page.style.width !== '250px') {
            page.style.width = '250px'
        }
        return
    }
    const w = canvas.style.width
    const m = w.match(/(\d+)/)
    if (m) {
        page.style.overflow = 'hidden'
        if (originalSelectedIndex === 3) {
            page.classList.add('scalePageWidth')
        }
        // add -4px to ensure that no horizontal scroll bar appears.
        const widthNum = Math.floor(Number(m[1]) / trimScale) - 4
        const width = widthNum + 'px'
        const offsetX = - Number(m[1]) * (1 - 1 / trimScale) / 2
        page.style.width = width
        canvasWrapper.style.width = width
        canvas.style.left = offsetX + 'px'
        canvas.style.position = 'relative'
        if (textLayer) {
            if (textLayer.style) {
                textLayer.style.width = widthNum - offsetX + 'px'
                textLayer.style.left = offsetX + 'px'
            } else {
                (textLayer.style as any) = `width: ${widthNum - offsetX}px; offset: ${offsetX}px;`
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
}

function setObserverToTrim() {
    const observer = new MutationObserver(records => {
        const trimSelect = document.getElementById('trimSelect') as HTMLSelectElement
        if (trimSelect.selectedIndex <= 0) {
            records.forEach(record => {
                const page = record.target as HTMLElement
                resetTrim(page)
            })
        } else {
            records.forEach(record => {
                const page = record.target as HTMLElement
                trimPage(page)
            })
        }
    })
    const viewer = document.getElementById('viewer') as HTMLElement
    for (const page of viewer.getElementsByClassName('page') as HTMLCollectionOf<HTMLElement>) {
        if (page.dataset.isObserved !== 'observed') {
            observer.observe(page, { attributes: true, childList: true, attributeFilter: ['style'] })
            page.setAttribute('data-is-observed', 'observed')
        }
    }
}

// We need to recaluculate scale and left offset for trim mode on each resize event.
window.addEventListener('resize', () => {
    const trimSelect = document.getElementById('trimSelect') as HTMLSelectElement
    const ind = trimSelect.selectedIndex
    if (!trimSelect || ind <= 0) {
        return
    }
    trimSelect.selectedIndex = 0
    const e = new Event('change')
    trimSelect.dispatchEvent(e)
    trimSelect.selectedIndex = ind
    trimSelect.dispatchEvent(e)
})

export class PageTrimmer {
    private readonly lwApp: ILatexWorkshopPdfViewer

    constructor(lwApp: ILatexWorkshopPdfViewer) {
        this.lwApp = lwApp
        // Set observers after a pdf file is loaded in the first time.
        this.lwApp.onPagesLoaded(setObserverToTrim, { once: true })
        // Skip the first loading
        this.lwApp.onPagesInit(() => {
            // Set observers each time a pdf file is refresed.
            this.lwApp.onPagesInit(setObserverToTrim)
        }, { once: true })

        this.lwApp.onPagesLoaded(() => {
            const select = document.getElementById('trimSelect') as HTMLSelectElement

            if (select.selectedIndex <= 0) {
                return
            }
            const viewer = document.getElementById('viewer') as HTMLElement
            for (const page of viewer.getElementsByClassName('page') as HTMLCollectionOf<HTMLElement>) {
                trimPage(page)
            }
        })
    }

    get originalPdfViewerCurrentScaleValue() {
        return originalPdfViewerCurrentScaleValue
    }
}
