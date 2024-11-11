export const DEBUG = new URLSearchParams(window.location.search).get('debug') === 'true'

export function debugPrint(...args: unknown[]) {
    if (!DEBUG) {
        return
    }
    let mesg = ''
    for (const arg of args) {
        if (typeof arg === 'string') {
            mesg += arg + '\n'
        } else if (arg instanceof Set) {
            mesg += JSON.stringify(Array.from(arg)) + '\n'
        } else {
            mesg += JSON.stringify(arg) + '\n'
        }
    }
    console.log(mesg)
}

export function debugPrintElements(elems: HTMLElement[]) {
    if (!DEBUG) {
        return
    }
    let mesg = ''
    for (const elem of elems) {
        let elemName = elem.nodeName.toLowerCase()
        const elemId = elem.id
        if (elemId) {
            elemName += ' id=' + elemId
        }
        const classList = Array.from(elem.classList)
        if (classList.length > 0) {
            elemName += ' class=' + JSON.stringify(classList)
        }
        mesg += elemName + '\n'
        const rect = elem.getBoundingClientRect()
        const { top, left, width, height } = rect
        const clientWidth = elem.clientWidth
        const args = {
            top: formatFloat(top),
            left: formatFloat(left),
            width: formatFloat(width),
            height: formatFloat(height),
            clientWidth: formatFloat(clientWidth)
        }
        let elemSizes = '{ '
        for (const [key, val] of Object.entries(args)) {
            elemSizes += `${key}: ${val}, `
        }
        elemSizes += '}'
        mesg += elemSizes + '\n'
    }
    console.log(mesg)
}

function formatFloat(num: number): string {
    return num.toFixed(3).padStart(10)
}
