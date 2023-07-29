import * as path from 'path'

import { readFilePath, statPath } from '../lib/lwfs/lwfs'
import type { EventBus } from './eventbus'
import type { Manager } from './manager'
import { isCacheLatest } from '../utils/utils'


interface AuxStore {
    readonly labelsMap: Map<string, { refNumber: string, pageNumber: string }>,
    mtime: number
}

export class AuxManager {
    // key: rootFile filePath
    private readonly auxFiles = new Map<string, AuxStore>()

    constructor(private readonly extension: {
        readonly eventBus: EventBus,
        readonly manager: Manager
    }) {
        extension.eventBus.rootFileChanged.event(async (rootFile) => {
            await this.setNumbersFromAuxFile(rootFile)
            void extension.eventBus.auxUpdated.fire(rootFile)
        })
        extension.eventBus.buildFinished.event(async (rootFile) => {
            if (rootFile === undefined) {
                return
            }
            await this.setNumbersFromAuxFile(rootFile)
            void extension.eventBus.auxUpdated.fire(rootFile)
        })
    }

    getAuxStore(rootFile: string) {
        return this.auxFiles.get(rootFile)
    }

    private async setNumbersFromAuxFile(rootFile: string) {
        const outDir = this.extension.manager.getOutDir(rootFile)
        const rootDir = path.dirname(rootFile)
        const auxFile = path.resolve(rootDir, path.join(outDir, path.basename(rootFile, '.tex') + '.aux'))
        const auxStat = await statPath(auxFile)
        let auxStore = this.auxFiles.get(rootFile)
        if (!auxStore) {
            auxStore = { labelsMap: new Map(), mtime: 0 }
            this.auxFiles.set(rootFile, auxStore)
        } else if (isCacheLatest(auxStore, auxStat)) {
            return
        } else {
            auxStore.labelsMap.clear()
            auxStore.mtime = 0
        }
        const auxLabelsStore = auxStore.labelsMap
        const newLabelReg = /^\\newlabel\{(.*?)\}\{\{(.*?)\}\{(.*?)\}/gm
        try {
            const auxContent = await readFilePath(auxFile)
            while (true) {
                const result = newLabelReg.exec(auxContent)
                if (result === null) {
                    break
                }
                if ( result[1].endsWith('@cref') && auxLabelsStore.has(result[1].replace('@cref', '')) ) {
                    // Drop extra \newlabel entries added by cleveref
                    continue
                }
                auxLabelsStore.set(result[1], {refNumber: result[2], pageNumber: result[3]})
            }
        } catch {
            // Ignore error
        }
        auxStore.mtime = auxStat.mtime
    }

}
