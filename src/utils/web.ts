let _isRunningOnWebWorker = false

export function setIsRunningOnWebWorker(value: boolean) {
    _isRunningOnWebWorker = value
}

export function isRunningOnWebWorker() {
    return _isRunningOnWebWorker
}
