import type * as vscode from 'vscode'
import { CmdEnvSuggestion } from './command'
import type {CommandSignatureDuplicationDetector} from './commandlib/commandlib'

export interface IProvider {

    /**
     * Returns the array of completion items. Should be called only from `Completer.completion`.
     */
    provideFrom(
        result: RegExpMatchArray,
        args: {document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext}
    ): vscode.CompletionItem[]
}

export interface ILwCompletionItem extends vscode.CompletionItem {
    label: string
}

export interface ICommand {
    getExtraPkgs(languageId: string): string[],
    provideCmdInPkg(pkg: string, cmdDuplicationDetector: CommandSignatureDuplicationDetector): CmdEnvSuggestion[]
}
