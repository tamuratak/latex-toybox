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
