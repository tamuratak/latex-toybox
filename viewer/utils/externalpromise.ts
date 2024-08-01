function promiseTriplet<T>() {
    let resolve: ((value: T | PromiseLike<T>) => void) = () => { /* nothing to do */ }
    let reject: ((reason?: unknown) => void) = () => { /* nothing to do */ }
    const promise = new Promise<T>((r, rej) => {
        resolve = r
        reject = rej
    })
    return {promise, resolve, reject}
}

/**
 * A Promise that can be resolved from outside.
 * A typical use case is a promise that resolves when a component has finished initializing.
 * This allows us to use await to wait for the component to finish initializing.
 */
export class ExternalPromise<T> {
    private readonly promiseTriplet = promiseTriplet<T>()
    #isResolved = false

    resolve(value: T) {
        if (this.#isResolved) {
            return
        }
        this.#isResolved = true
        this.promiseTriplet.resolve(value)
    }

    reject(reason?: unknown) {
        if (this.#isResolved) {
            return
        }
        this.#isResolved = true
        this.promiseTriplet.reject(reason)
    }

    get promise(): Promise<T> {
        return this.promiseTriplet.promise
    }

    get isResolved(): boolean {
        return this.#isResolved
    }

}
