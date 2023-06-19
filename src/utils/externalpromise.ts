function promisePair<T>() {
    let resolve: ((value: T | PromiseLike<T>) => void) = () => {}
    const promise = new Promise<T>((r) => {
        resolve = r
    })
    return {promise, resolve}
}

/**
 * A Promise that can be resolved from outside.
 * A typical use case is a promise that resolves when a component has finished initializing.
 * This allows us to use await to wait for the component to finish initializing.
 */
export class ExternalPromise<T> {
    private readonly promisePair = promisePair<T>()
    #isResolved = false

    resolve(value: T) {
        if (this.#isResolved) {
            return
        }
        this.#isResolved = true
        this.promisePair.resolve(value)
    }

    get promise(): Promise<T> {
        return this.promisePair.promise
    }

    get isResolved(): boolean {
        return this.#isResolved
    }

}
