import { RabbitManager } from './RabbitManager'
import { CallResponse } from '../../../../../../CallResponse'
import { EventBus } from '../../../../../../EventBus/EventBus'
import { CallRequest } from '../../../../../../CallRequest'
import { LocalHandlerManager } from '../../../LocalHandlerManager'

describe('RabbitManager', () => {
  const config = {
    displayName: 'test',
    ephemeralId: 'test',
  }

  const localHandlerManager = new LocalHandlerManager({
    config,
    eventBus: new EventBus(),
  })

  const rpcServerOptions = {
    config: {
      displayName: 'test',
      ephemeralId: Math.random().toString(),
      messageBroker: {
        amqpURI: 'amqp://127.0.0.1:5672',
      },
    },
    eventBus: new EventBus(),
    requestHandler: localHandlerManager.manageRequest,
  }

  it('can instantiate', (done) => {
    const rabbit = new RabbitManager(rpcServerOptions)

    rabbit.shutdown().then(done)
  })

  it('can add a request handler and respond to queue RPCs', async () => {
    const rabbit = new RabbitManager(rpcServerOptions)

    const handler = async (request: CallRequest) => {
      expect(request.method).toEqual('test-single')
      expect(request.scope).toEqual('test-single-scope')
      expect(request.version).toEqual('1')
      expect(request.trace.id).toEqual('abc123abc123')

      const response = new CallResponse(
        {
          code: 200,
          data: 'ABC123',
          success: true,
        },
        request,
      )

      return response
    }

    const requestDescription = {
      method: 'test-single',
      scope: 'test-single-scope',
      version: '1',
    }

    localHandlerManager.registerHandler(requestDescription, handler)

    await rabbit.subscribeToHandleRequest(requestDescription)

    const request = new CallRequest({
      method: 'test-single',
      scope: 'test-single-scope',
      trace: { caller: 'test', id: 'abc123abc123' },
      version: '1',
    })

    const response = await rabbit.sendRequestForResponse(request)

    expect(response.data).toBeDefined()
    expect(response.data).toEqual('ABC123')

    await rabbit.shutdown()
  })

  it('can respond to multiple queue RPCs', async () => {
    const localHandlerManager = new LocalHandlerManager({
      config,
      eventBus: new EventBus(),
    })

    const rpcServerOptions = {
      config: {
        displayName: 'test',
        ephemeralId: Math.random().toString(),
        messageBroker: {
          amqpURI: 'amqp://127.0.0.1:5672',
        },
      },
      eventBus: new EventBus(),
      requestHandler: localHandlerManager.manageRequest,
    }

    const rabbit = new RabbitManager(rpcServerOptions)

    const handler = async (request: CallRequest) => {
      return new CallResponse(
        {
          code: 200,
          data: `data-${request.args}`,
          success: true,
        },
        request,
      )
    }

    const requestDescription = {
      method: 'test',
      scope: 'test',
      version: '1',
    }

    localHandlerManager.registerHandler(requestDescription, handler)

    await rabbit.subscribeToHandleRequest(requestDescription)

    const countList = new Array(10).fill(null)
    let index = 0

    for await (const _ of countList) {
      const response = await rabbit.sendRequestForResponse(
        new CallRequest({
          args: index,
          method: 'test',
          scope: 'test',
          trace: { caller: 'test', id: `id-${index}` },
          version: '1',
        }),
      )

      expect(response.data).toEqual(`data-${index}`)

      index++
    }

    await rabbit.shutdown()
  })

  it('will respond when no handler is registered for a scope/method/version', async () => {
    const rabbit = new RabbitManager(rpcServerOptions)

    const requestDescription = {
      method: 'no-handler-expected',
      scope: '',
      version: '1',
    }

    await rabbit.subscribeToHandleRequest(requestDescription)

    const request = new CallRequest({
      ...requestDescription,
      trace: { caller: 'test', id: '098776655' },
    })

    const response = await rabbit.sendRequestForResponse(request)

    expect(response.code).toEqual(501)
    expect(response.data).toBeUndefined()
    expect(response.success).toBeFalsy()

    await rabbit.shutdown()
  })
})
