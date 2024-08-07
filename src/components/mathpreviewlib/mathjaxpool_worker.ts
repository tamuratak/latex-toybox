import * as workerpool from 'workerpool'
import type {ConvertOption, SupportedExtension, SvgOption, TexOption} from 'mathjax-full'
import { mathjax } from 'mathjax-full/js/mathjax.js'
import { TeX } from 'mathjax-full/js/input/tex.js'
import { SVG } from 'mathjax-full/js/output/svg.js'
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js'
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js'
import type { LiteElement } from 'mathjax-full/js/adaptors/lite/Element.js'
import type { MathDocument } from 'mathjax-full/js/core/MathDocument.js'
import type { LiteDocument } from 'mathjax-full/js/adaptors/lite/Document.js'
import type { LiteText } from 'mathjax-full/js/adaptors/lite/Text.js'
import 'mathjax-full/js/input/tex/AllPackages.js'


const adaptor = liteAdaptor()
RegisterHTMLHandler(adaptor)

const baseExtensions: SupportedExtension[] = ['ams', 'base', 'color', 'newcommand', 'noerrors', 'noundefined']

function createHtmlConverter(extensions: SupportedExtension[]) {
    const baseTexOption: TexOption = {
        packages: extensions,
        formatError: (_jax, error) => { throw new Error(error.message) }
    }
    const texInput = new TeX<LiteElement, LiteText, LiteDocument>(baseTexOption)
    const svgOption: SvgOption = {fontCache: 'local'}
    const svgOutput = new SVG<LiteElement, LiteText, LiteDocument>(svgOption)
    return mathjax.document('', {InputJax: texInput, OutputJax: svgOutput}) as MathDocument<LiteElement, LiteText, LiteDocument>
}

let html = createHtmlConverter(baseExtensions)

export function loadExtensions(extensions: SupportedExtension[]) {
    const extensionsToLoad = baseExtensions.concat(extensions)
    html = createHtmlConverter(extensionsToLoad)
}

export function typeset(arg: string, opts: { scale: number, color: string }): string {
    const convertOption: ConvertOption = {
        display: true,
        em: 18,
        ex: 9,
        containerWidth: 80*18
    }
    const node = html.convert(arg, convertOption) as LiteElement

    const css = `svg {font-size: ${100 * opts.scale}%;} * { color: ${opts.color} }`
    let svgHtml = adaptor.innerHTML(node)
    svgHtml = svgHtml.replace(/<defs>/, `<defs><style>${css}</style>`)
    const minWidth = getMinWidth(svgHtml)
    if (minWidth !== undefined) {
        svgHtml = svgHtml.replace('width="100%"', `width="${minWidth}ex"`)
    }
    return svgHtml
}

function getMinWidth(svgHtml: string): number | undefined {
    const match = svgHtml.match(/min-width: ([\d.]+)ex;/)
    if (match && match[1]) {
        return Number(match[1])
    }
    return
}

const workers = {loadExtensions, typeset}

// workerpool passes the resolved value of Promise, not Promise.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type IMathJaxWorker = {
    loadExtensions: (...args: Parameters<typeof loadExtensions>) => void,
    typeset: (...args: Parameters<typeof typeset>) => string
}

workerpool.worker(workers)
