export const DEBUG = false

export function debugPrint(arg: any) {
    if (!DEBUG) {
        return
    }
    if (typeof arg === 'string') {
        console.log(arg)
    } else if (arg instanceof Set) {
        debugPrint(Array.from(arg))
    } else {
        console.log(JSON.stringify(arg))
    }
}
