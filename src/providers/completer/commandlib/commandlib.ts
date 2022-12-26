import * as vscode from 'vscode'
import { existsPath } from '../../../lib/lwfs/lwfs'
import {CmdEnvSuggestion} from '../command'


export function isTriggerSuggestNeeded(name: string): boolean {
    const reg = /^(?:[a-z]*(cite|ref|input)[a-z]*|begin|bibitem|(sub)?(import|includefrom|inputfrom)|gls(?:pl|text|first|plural|firstplural|name|symbol|desc|user(?:i|ii|iii|iv|v|vi))?|Acr(?:long|full|short)?(?:pl)?|ac[slf]?p?)/i
    return reg.test(name)
}

export async function resolveCmdEnvFile(name: string, dataDir: string) {
    const dirs = vscode.workspace.getConfiguration('latex-workshop').get('intellisense.package.dirs') as string[]
    dirs.push(dataDir)
    for (const dir of dirs) {
        const f = `${dir}/${name}`
        if (await existsPath(f)) {
            return f
        }
    }
    // Many package with names like toppackage-config.sty are just wrappers around
    // the general package toppacke.sty and do not define commands on their own.
    const suffix = name.substring(name.lastIndexOf('_'))
    const indexDash = name.lastIndexOf('-')
    if (indexDash > - 1) {
        const generalPkg = name.substring(0, indexDash)
        const f = `${dataDir}/${generalPkg}${suffix}`
        if (await existsPath(f)) {
            return f
        }
    }
    return undefined
}

export class CommandSignatureDuplicationDetector {
    private readonly cmdSignatureList: Set<string> = new Set<string>()

    add(cmd: CmdEnvSuggestion) {
        this.cmdSignatureList.add(cmd.signatureAsString())
    }

    has(cmd: CmdEnvSuggestion): boolean {
        return this.cmdSignatureList.has(cmd.signatureAsString())
    }
}

export class CommandNameDuplicationDetector {
    private readonly cmdSignatureList: Set<string> = new Set<string>()

    constructor(suggestions: CmdEnvSuggestion[] = []) {
        this.cmdSignatureList = new Set<string>(suggestions.map(s => s.name()))
    }

    add(cmd: CmdEnvSuggestion): void
    add(cmdName: string): void
    add(cmd: any): void {
        if (cmd instanceof CmdEnvSuggestion) {
            this.cmdSignatureList.add(cmd.name())
        } else if (typeof(cmd) === 'string') {
            this.cmdSignatureList.add(cmd)
        } else {
            throw new Error('Unaccepted argument type')
        }
    }

    has(cmd: CmdEnvSuggestion): boolean
    has(cmd: string): boolean
    has(cmd: any): boolean {
        if (cmd instanceof CmdEnvSuggestion) {
            return this.cmdSignatureList.has(cmd.name())
        } else if (typeof(cmd) === 'string') {
            return this.cmdSignatureList.has(cmd)
        } else {
            throw new Error('Unaccepted argument type')
        }
    }
}
