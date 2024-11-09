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
    const mesg = []
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
        mesg.push(elemName)
        const rect = elem.getBoundingClientRect()
        const { top, left, width, height } = rect
        const clientWidth = elem.clientWidth
        mesg.push({ top, left, width, height, clientWidth })
    }
    debugPrint(...mesg)
}
