function promiseTriplet<T>() {
    let resolve: ((value: T | PromiseLike<T>) => void) = () => {}
    let reject: ((reason?: any) => void) = () => {}
    const promise = new Promise<T>((r, rej) => {
        resolve = r
        reject = rej
    })
    return {promise, resolve, reject}
}

/**
 * A Promise that can be resolved from outside. A common scenario involves
 * using a promise where the resolve and reject functions are called
 * in separate callbacks.
 *
 * See https://github.com/tc39/proposal-promise-with-resolvers#synopsis
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

    reject(reason?: any) {
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
