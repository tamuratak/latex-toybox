import { inspect } from 'node:util'

export function inspectReadable(obj: unknown): string {
    return inspect(obj, { compact: false, depth: null, breakLength: Infinity })
}

export function inspectCompact(obj: unknown): string {
    return inspect(obj, { compact: true, depth: null, breakLength: Infinity })
}
