import * as vscode from 'vscode'
import type { Extension } from '../main'


export class RenameProvider implements vscode.RenameProvider {
    private readonly extension: Extension

    constructor(extension: Extension) {
        this.extension = extension
    }

    private getLabelRangeAtPos(document: vscode.TextDocument, position: vscode.Position) {
        const regex = /\\(label|eqref|ref|autoref)\{([^}]*)\}/
        const commandRange = document.getWordRangeAtPosition(position, regex)
        if (!commandRange) {
            return
        }
        const commandWithArg = document.getText(commandRange)
        const commandOnly = commandWithArg.match(/^\\(label|eqref|ref|autoref)/)?.[0]
        if (commandOnly === undefined) {
            return
        }
        const startOffset = document.offsetAt(commandRange.start) + commandOnly.length + '{'.length
        const endOffset = document.offsetAt(commandRange.end) - '}'.length
        const labelRange = new vscode.Range(
            document.positionAt(startOffset),
            document.positionAt(endOffset)
        )
        return labelRange
    }

    prepareRename(
        document: vscode.TextDocument,
        position: vscode.Position,
    ) {
        const labelRange = this.getLabelRangeAtPos(document, position)
        if (labelRange === undefined) {
            throw new Error('You cannot rename this.')
        }
        return labelRange
    }

    provideRenameEdits(
        document: vscode.TextDocument,
        position: vscode.Position,
        newName: string,
    ): vscode.ProviderResult<vscode.WorkspaceEdit> {
        const labelRange = this.getLabelRangeAtPos(document, position)
        if (labelRange === undefined) {
            return
        }
        const label = document.getText(labelRange)
        const refLocations = this.extension.referenceStore.refCommandLocationMap.get(label) || []
        const defLocations = this.extension.referenceStore.labelCommandLocationMap.get(label) || []
        const locations = [...refLocations, ...defLocations]
        const edit = new vscode.WorkspaceEdit()
        locations?.forEach(location => {
            edit.replace(location.uri, location.range, newName)
        })
        return edit
    }
}
