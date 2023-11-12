import { ILogger } from '../../src/interfaces.js'

export class FakeLogger implements ILogger {
    info() {}
    logCommand() {}
    debug(){}
    error(){}
    logError() {}
    showLog() {}
}
