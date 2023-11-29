const DEFAULT_TIMEOUT = 30000

export class PromiseTimeoutError extends Error {}

export class PromiseWrapper<T, E> {
  private rejectPromise?: (arg?: E) => void
  private resolvePromise?: (arg: T) => void

  readonly promise: Promise<T>

  constructor(timeout?: number) {
    this.promise = new Promise( (resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new PromiseTimeoutError('PromiseWraper timeout'))
      }, timeout || DEFAULT_TIMEOUT)

      this.rejectPromise = (arg?: E) => {
        clearTimeout(timer)

        reject(arg)
      }

      this.resolvePromise = (arg: T) => {
        clearTimeout(timer)

        resolve(arg)
      }
    })
  }

  reject = (rejectReturnValue?: E): any => {
    if (this.rejectPromise) {
      this.rejectPromise(rejectReturnValue)
    }
  }

  resolve = (resolveReturnValue: T): void => {
    if (this.resolvePromise) {
      this.resolvePromise(resolveReturnValue)
    }
  }
}
