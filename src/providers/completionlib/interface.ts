import type * as vscode from 'vscode'
import { CmdEnvSuggestion } from './command.js'
import type {CommandSignatureDuplicationDetector} from './commandlib/commandlib.js'
import { latexParser } from 'latex-utensils'

export interface IProvider {
    /**
     * Returns the array of completion items. Should be called only from `Completer.completion`.
     */
    provideFrom(
        result: RegExpMatchArray,
        args: {document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext}
    ): vscode.CompletionItem[] | Promise<vscode.CompletionItem[]>
}

export interface ILwCompletionItem extends vscode.CompletionItem {
    label: string
}

export interface ICommand {
    getExtraPkgs(languageId: string): string[],
    provideCmdInPkg(pkg: string, cmdDuplicationDetector: CommandSignatureDuplicationDetector): CmdEnvSuggestion[]
}

export interface IContexAwareProvider {
    readonly needsAst: boolean,
    test(document: vscode.TextDocument, position: vscode.Position, context: vscode.CompletionContext): boolean,
    provide(document: vscode.TextDocument, position: vscode.Position, context: vscode.CompletionContext, ast: latexParser.LatexAst | undefined): vscode.CompletionItem[] | Thenable<vscode.CompletionItem[]>
}
