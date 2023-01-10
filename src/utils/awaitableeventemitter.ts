import * as vscode from 'vscode'

export class AwaitableEventEmitter<T, Name extends string> {
    private readonly cbSet: Set<(arg: T) => unknown> = new Set()

    constructor(readonly eventName: Name) {}

    event(cb: (arg: T) => unknown): vscode.Disposable {
        this.cbSet.add(cb)
        return new vscode.Disposable(() => this.cbSet.delete(cb))
    }

    /**
     * We can wait all the callbacks done by awaiting the returned promise.
     *
     * **Notice** When misused, it would easily lead to deadlock.
     */
    fire(arg: T): Promise<unknown> {
        return Promise.allSettled(
            [...this.cbSet.values()].map(cb => cb(arg))
        )
    }

}
