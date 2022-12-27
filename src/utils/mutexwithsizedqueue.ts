import { Mutex } from '../lib/await-semaphore'

export class MutexWithSizedQueueError extends Error { }

export class MaxWaitingLimitError extends MutexWithSizedQueueError { }

export class MutexWithSizedQueue {
    readonly maxWaitingLimit: number
    #waiting: number = 0
    private readonly mutex = new Mutex()

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

    async noopIfOccupied(cb: () => Promise<unknown>) {
        let release: (() => void) | undefined
        try {
            release = await this.acquire()
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
