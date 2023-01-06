import type {ILogger} from '../../src/interfaces'

export class FakeLogger implements ILogger {
    info() {}
    logCommand() {}
    debug(){}
    error(){}
    logError() {}
    logOnRejected() {}
    showLog() {}
}
