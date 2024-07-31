import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

export function normalize(filePath: string) {
    let normPath = path.normalize(filePath)
    if (os.platform() === 'win32') {
        // Normalize drive letters on Windows.
        normPath = normPath.replace(/^([a-zA-Z]):/, (_m, p1: string) => p1.toLocaleUpperCase() + ':')
    }
    return normPath
}

export async function isSameRealPath(filePathA: string, filePathB: string): Promise<boolean> {
    try {
        const a = normalize(await fs.promises.realpath(path.normalize(filePathA)))
        const b = normalize(await fs.promises.realpath(path.normalize(filePathB)))
        return a === b
    } catch (_) {
        return false
    }
}
