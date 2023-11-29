import { WebSocketServer } from './WebSocketServer'
import { CallResponse } from '../../CallResponse'
import { CallRequest } from '../../CallRequest'
import { EventBus } from '../../EventBus/EventBus'
import WebSocket from 'ws'
import { RPCClientIdentity } from '../../RPCClientIdentity'

describe('WebSocketServer', () => {
  const wsServerOptions = {
    config: {
      displayName: 'test',
      ephemeralId: Math.random().toString(),
      gatewayServer: {
        websocket: {
          port: 9183,
        },
      },
    },
    eventBus: new EventBus(),
  }

  it('can instantiate', () => {
    new WebSocketServer(wsServerOptions)
  })

  it('can set an incoming request handler', () => {
    const wsServer = new WebSocketServer(wsServerOptions)

    const handler = (request: CallRequest) =>
      Promise.resolve(CallResponse.EMPTY)

    wsServer.setIncomingRequestHandler(handler)
  })

  it('can start/stop ws server', (done) => {
    const wsServer = new WebSocketServer(wsServerOptions)

    const handler = (request: CallRequest) =>
      Promise.resolve(CallResponse.EMPTY)

    wsServer.setIncomingRequestHandler(handler)

    wsServer.start(() => {
      wsServer.stop(done)
    })
  })

  it('accepts client connections', (done) => {
    const wsServer = new WebSocketServer(wsServerOptions)

    wsServer.setIncomingRequestHandler(() => CallResponse.EMPTY)

    wsServer.start(() => {
      const ws = new WebSocket('ws://0.0.0.0:9183')

      ws.onopen = (event) => {
        // @ts-ignore
        expect(event?.type).toEqual('open')

        wsServer.stop(done)
      }
    })
  })

  it('responds to incoming client RPC messages', (done) => {
    const wsServer = new WebSocketServer(wsServerOptions)

    wsServer.setIncomingRequestHandler(async (request: CallRequest) => {
      return new CallResponse(
        {
          code: 200,
          success: true,
        },
        request,
      )
    })

    wsServer.start(() => {
      const ws = new WebSocket('ws://0.0.0.0:9183')

      ws.onmessage = (msg) => {
        // @ts-ignore
        const response = JSON.parse(msg?.data)

        expect(response).toEqual({});
        // expect(response.success).toBeTruthy()

        wsServer.stop(done)
      }

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            method: 'method',
            scope: 'scope',
            version: '1',
          }),
        )
      }
    })
  })

  it('retains client connection identity for subsequent requests', (done) => {
    const wsServer = new WebSocketServer(wsServerOptions)

    const identity: RPCClientIdentity = {
      authorization: 'auth123',
    }

    wsServer.setIncomingRequestHandler(async (request: CallRequest) => {
      return new CallResponse(
        {
          code: 200,
          data: request.identity,
          success: true,
        },
        request,
      )
    })

    wsServer.start(() => {
      const ws = new WebSocket('ws://0.0.0.0:9183')

      let responseCount = 0

      ws.onmessage = (msg) => {
        responseCount++

        // the first response is an "ok, I set your identity" from the WebSocketServer geting the identity request
        if (responseCount === 2) {
          // @ts-ignore
          const response = JSON.parse(msg?.data)

          expect(response).toEqual(identity)

          wsServer.stop(done)
        }
      }

      ws.onopen = () => {
        // only sending "identity" over WS tells the WebSocketServer to remember this ws connection and RPCClientIdentity
        ws.send(
          JSON.stringify({
            identity,
          }),
        )

        ws.send(
          JSON.stringify({
            method: 'anything',
          }),
        )
      }
    })
  })

  it('client connections can send messages to the RPC server', (done) => {
    const wsServer = new WebSocketServer(wsServerOptions)

    wsServer.setIncomingRequestHandler(() => CallResponse.EMPTY)

    const clientMessage = {
      clientMessage: 'test',
    }

    wsServer.addClientMessageHandler((msg) => {
      expect(msg.clientMessage).toEqual(clientMessage)

      wsServer.stop(done)
    })

    wsServer.start(() => {
      const ws = new WebSocket('ws://0.0.0.0:9183')

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            clientMessage,
          }),
        )
      }
    })
  })

  it('RPC server can send messages to client connections', (done) => {
    const wsServer = new WebSocketServer(wsServerOptions)

    wsServer.setIncomingRequestHandler(() => CallResponse.EMPTY)

    const serverSentMessage = {
      someData: 'test',
    }

    wsServer.addClientMessageHandler((msg) => {
      wsServer.sendMessageToClient(msg.connectionId, serverSentMessage)
    })

    wsServer.start(() => {
      const ws = new WebSocket('ws://0.0.0.0:9183')

      ws.onmessage = (msg) => {
        console.log('msg', msg.data)
        expect(JSON.parse(msg.data as string).serverMessage).toEqual(serverSentMessage)

        wsServer.stop(done)
      }

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            clientMessage: 'reply to me',
          }),
        )
      }
    })
  })
})
