import { MessageBrokerManager } from './MessageBrokerManager'
import { EventBus } from '../../../../EventBus/EventBus'
import { CallResponse } from '../../../../CallResponse'

describe('MessageBrokerManager', () => {
  it('can instantiate', () => {
    const messageBrokerManager = new MessageBrokerManager({
      config: {
        displayName: 'test',
        ephemeralId: Math.random().toString(),
        messageBroker: {
          amqpURI: 'amqp://guest:guest@localhost:5672',
        },
      },
      eventBus: new EventBus(),
      requestHandler: async () => Promise.resolve(CallResponse.EMPTY),
    })

    expect(messageBrokerManager).toBeDefined()
  })
})
