import type {ILogger} from '../../src/interfaces'

export class FakeLogger implements ILogger {
    info() {}
    logCommand() {}
    debug(){}
    addCompilerMessage() {}
    logError() {}
    logOnRejected() {}
    clearCompilerMessage() {}
    displayStatus() {}
    showErrorMessage(): Thenable<string | undefined> | undefined { return }
    showErrorMessageWithCompilerLogButton() {}
    showErrorMessageWithExtensionLogButton() {}
    showLog() {}
    showCompilerLog() {}
}
