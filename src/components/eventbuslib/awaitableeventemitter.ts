import * as vscode from 'vscode'


/**
 * A simple EventEmitter implementation using Set.
 */
export class AwaitableEventEmitter<T, Name extends string> {
    private readonly cbSet = new Set<(arg: T) => unknown>()

    constructor(readonly eventName: Name) {}

    event(cb: (arg: T) => unknown): vscode.Disposable {
        this.cbSet.add(cb)
        return new vscode.Disposable(() => this.cbSet.delete(cb))
    }

    /**
     * We can wait all the callbacks done by awaiting the returned promise.
     * This method can be executed synchronously if callbacks are synchronous.
     *
     * **Notice** When misused, awaiting the returned promise would easily lead to deadlock.
     *
     */
    fire(arg: T): Promise<unknown> {
        return Promise.allSettled(
            [...this.cbSet.values()].map(cb => cb(arg))
        )
    }

}
