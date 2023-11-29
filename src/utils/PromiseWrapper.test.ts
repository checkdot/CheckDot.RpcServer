import { PromiseWrapper } from './PromiseWrapper'

describe('PromiseWrapper', () => {
  it('can instantiate', () => {
    const p = new PromiseWrapper()
    p.resolve(null)
  })

  it('can creates a promise', (done) => {
    const { promise, resolve } = new PromiseWrapper()

    expect(promise.then).toBeDefined()
    expect(promise.catch).toBeDefined()
    expect(promise.finally).toBeDefined()

    promise.then(() => {
      done()
    })

    resolve(null)
  })

  it('will timeout', () => {
    const { promise } = new PromiseWrapper(1)

    expect(promise).rejects.toThrow(Error)
  })
})
