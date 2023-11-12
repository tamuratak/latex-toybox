import * as path from 'node:path'

export function getExtensionDevelopmentPath(): string {
    const extPath = path.resolve(__dirname, '../../../')
    return extPath
}
