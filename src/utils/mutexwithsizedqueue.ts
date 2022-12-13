import { Mutex } from '../lib/await-semaphore'

export class MutexWithSizedQueue {
    readonly maxWaitingLimit: number
    #waiting: number = 0
    private readonly mutex = new Mutex()

    constructor(maxWaitingLimit: number) {
        if (maxWaitingLimit < 0) {
            throw new Error('maxWaitingLimit must not be negative')
        }
        this.maxWaitingLimit = maxWaitingLimit
    }

    async acquire() {
        if (this.maxWaitingLimit === 0 && this.mutex.is_locked() ||
            this.#waiting >= this.maxWaitingLimit) {
            throw new Error('Queue max waiting limit reached')
        }
        this.#waiting++
        const release = await this.mutex.acquire()
        this.#waiting--
        return release
    }

}
