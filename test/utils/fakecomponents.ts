import { ILogger } from '../../src/interfaces.js'

export class FakeLogger implements ILogger {
    info() { return }
    logCommand() { return }
    debug() { return }
    error() { return }
    logError() { return }
    showLog() { return }
}
