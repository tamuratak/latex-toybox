import type {Extension} from '../main'

export class Cleaner {
    readonly extension: Extension

    constructor(extension: Extension) {
        this.extension = extension
    }

    clean(rootFile?: string): Promise<void> {
        console.log(JSON.stringify(['noop clean', rootFile]))
        return Promise.resolve()
    }

}
