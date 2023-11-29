import { Event, EventBus } from './EventBus'

describe('EventBus', () => {
  it('can instantiate', () => {
    new EventBus()
  })

  it('can subscribe/publish', (done) => {
    const eventBus = new EventBus()

    eventBus.subscribe<string>('TEST', (str) => {
      expect(str).toEqual('str')

      done()
    })

    setTimeout(() => {
      eventBus.publish({ topic: 'TEST', payload: 'str' })
    }, 1)
  })

  it('can unsubscribe', (done) => {
    const eventBus = new EventBus()

    const handler = jest.fn((str) => {
      expect(str).toEqual('str')
    })

    const { unsubscribe } = eventBus.subscribe<string>('TEST', handler)

    unsubscribe()

    setTimeout(() => {
      eventBus.publish({ topic: 'TEST', payload: 'str' })

      setTimeout(() => {
        expect(handler.mock.calls.length).toEqual(0)

        done()
      }, 1)
    }, 1)
  })

  it('can publish async', (done) => {
    const eventBus = new EventBus()

    const handler = jest.fn(async (str) => {
      await Promise.resolve(str)
    })

    eventBus.subscribe<string>('TEST', handler)

    setTimeout(async () => {
      await eventBus.publishAsync({ topic: 'TEST', payload: 'str' })

      expect(handler.mock.calls.length).toEqual(1)

      done()
    }, 1)
  })

  it('can publish sync', (done) => {
    const eventBus = new EventBus()

    eventBus.subscribe<string>('TEST', (str) => {
      expect(str).toEqual('str')

      done()
    })

    setTimeout(() => {
      eventBus.publishSync({ topic: 'TEST', payload: 'str' })
    }, 1)
  })
})
