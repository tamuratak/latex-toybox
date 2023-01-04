import type {ILogger} from '../../src/interfaces'

export class FakeLogger implements ILogger {
    info() {}
    logCommand() {}
    debug(){}
    addCompilerMessage() {}
    logError() {}
    logOnRejected() {}
    clearCompilerMessage() {}
    showLog() {}
    showCompilerLog() {}
}
