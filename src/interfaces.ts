export interface LoggerLocator {
    readonly logger: ILogger
}

export interface ILogger {
    info(message: string): void,
    logCommand(message: string, command: string, args?: readonly string[]): void,
    debug(message: string): void,
    error(message: string): void,
    logError(e: Error): void,
    logOnRejected(e: unknown): void,
    showLog(): void
}
