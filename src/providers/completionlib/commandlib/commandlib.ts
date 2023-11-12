import { CmdEnvSuggestion } from '../command.js'


/**
 * Dertermine if intellisense should be triggered after the given command is inserted,
 * e.g. \input{}, \cite{}, \ref{}, etc.
 * @param name command name
 * @returns true if intellisense should be triggered, false otherwise.
 */
export function isTriggerSuggestNeeded(name: string): boolean {
    const reg = /^(?:[a-z]*(cite|ref|input)[a-z]*|begin|bibitem|(sub)?(import|includefrom|inputfrom)|gls(?:pl|text|first|plural|firstplural|name|symbol|desc|user(?:i|ii|iii|iv|v|vi))?|Acr(?:long|full|short)?(?:pl)?|ac[slf]?p?)/i
    return reg.test(name)
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
