import { Mutex } from '../lib/await-semaphore/index.js'

export class MutexWithSizedQueueError extends Error { }

export class MaxWaitingLimitError extends MutexWithSizedQueueError { }

/**
 * A mutex with a queue of a maximum size.
 */
export class MutexWithSizedQueue {
    readonly maxWaitingLimit: number
    #waiting = 0
    private readonly mutex = new Mutex()

    /**
     * Creates a mutex with a queue of a maximum size.
     *
     * @param maxWaitingLimit The maximum number of tasks that can be waiting for the mutex at the same time.
     */
    constructor(maxWaitingLimit: number) {
        if (maxWaitingLimit < 0) {
            throw new MutexWithSizedQueueError('maxWaitingLimit must not be negative')
        }
        this.maxWaitingLimit = maxWaitingLimit
    }

    async acquire() {
        if (this.maxWaitingLimit === 0 && this.mutex.is_locked() ||
            this.#waiting >= this.maxWaitingLimit) {
                throw new MaxWaitingLimitError('Queue max waiting limit reached')
        }
        this.#waiting++
        const release = await this.mutex.acquire()
        this.#waiting--
        return release
    }

    get waiting() {
        return this.#waiting
    }

    /**
     * Convenience method that acquires the mutex and calls a callback function
     * if the mutex is available. If the maximum waiting limit has been reached,
     * the method returns without calling the callback.
     *
     * @param cb The callback function to call if the mutex is available.
     * @returns The result of the callback function.
     */
    async noopIfOccupied<T = unknown>(cb: () => Promise<T>) {
        let release: (() => void) | undefined
        try {
            release = await this.acquire()
            // We should await cb(). Otherwise, release() will be called before cb() is finished.
            return await cb()
        } catch (e) {
            if (e instanceof MaxWaitingLimitError) {
                return
            }
            throw e
        } finally {
            release?.()
        }
    }
}
