import { HttpServer } from './HttpServer'
import { CallResponse } from '../../CallResponse'
import { CallRequest } from '../../CallRequest'
import { EventBus } from '../../EventBus/EventBus'

describe('HttpServer', () => {
  const httpServerOptions = {
    config: {
      displayName: 'test',
      ephemeralId: Math.random().toString(),
      gatewayServer: {
        http: {
          port: 9182,
        },
      },
    },
    eventBus: new EventBus(),
  }

  it('can instantiate', () => {
    new HttpServer(httpServerOptions)
  })

  it('can set an incoming request handler', () => {
    const httpServer = new HttpServer(httpServerOptions)

    const handler = (request: CallRequest) =>
      Promise.resolve(CallResponse.EMPTY)

    httpServer.setIncomingRequestHandler(handler)
  })

  it('can start/stop http server', (done) => {
    const httpServer = new HttpServer(httpServerOptions)

    const handler = (request: CallRequest) =>
      Promise.resolve(CallResponse.EMPTY)

    httpServer.setIncomingRequestHandler(handler)

    httpServer.start()

    setTimeout(() => {
      httpServer.stop(done)
    }, 1)
  })
})
