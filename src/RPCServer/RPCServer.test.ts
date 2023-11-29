import axios from 'axios'
import { RPCServer } from './RPCServer'
import { CallResponse } from '../CallResponse'
import { CallRequest } from '../CallRequest'

describe('basic rpc gatewayServer', () => {
  it('can setup a basic http (http 1.1) gatewayServer and listen on a port', async () => {
    const server = new RPCServer({
      displayName: 'test',
      ephemeralId: Math.random().toString(),
      gatewayServer: {
        http: { bind: 'localhost', port: 6789 },
      },
    })

    server.registerHandler(
      { method: 'basic-gatewayServer-test', scope: 'global', version: '1' },
      async (request) => {
        return { code: 200, success: true }
      },
    )

    server.start()

    try {
      const data = await axios.post('http://localhost:6789', {
        method: 'basic-gatewayServer-test',
      })

      expect(data).toMatchObject({})
    } finally {
      server.stop()

      await new Promise((r) => setTimeout(r, 1000))
    }
  })

  it('handles scope correctly for methods', async () => {
    const server = new RPCServer({
      displayName: 'test',
      ephemeralId: Math.random().toString(),
      gatewayServer: {
        http: { bind: 'localhost', port: 6789 },
      },
    })

    server.registerHandler(
      { method: 'scope-test', scope: 'global', version: '1' },
      async (request) => {
        return new CallResponse(
          {
            code: 200,
            data: { scope: 'global' },
            success: true,
          },
          request,
        )
      },
    )

    server.registerHandler(
      { method: 'scope-test', scope: 'first', version: '1' },
      async (request: CallRequest) => {
        return new CallResponse(
          {
            code: 200,
            data: { scope: 'first' },
            success: true,
          },
          request,
        )
      },
    )

    server.registerHandler(
      { method: 'scope-test', scope: 'second', version: '1' },
      async (request) => {
        return new CallResponse(
          {
            code: 200,
            data: { scope: 'second' },
            success: true,
          },
          request,
        )
      },
    )

    server.start()

    try {
      const noScope = await axios.post('http://localhost:6789', {
        method: 'scope-test',
      })

      expect(noScope.data.scope).toEqual('global')

      const first = await axios.post('http://localhost:6789', {
        method: 'scope-test',
        scope: 'first',
      })

      expect(first.data.scope).toEqual('first')

      const second = await axios.post('http://localhost:6789', {
        method: 'scope-test',
        scope: 'second',
      })

      expect(second.data.scope).toEqual('second')
    } finally {
      server.stop()

      await new Promise((r) => setTimeout(r, 1000))
    }
  })

  it('handles version correctly for methods', async () => {
    const server = new RPCServer({
      displayName: 'test',
      ephemeralId: Math.random().toString(),
      gatewayServer: {
        http: { bind: 'localhost', port: 6789 },
      },
    })

    server.registerHandler(
      { method: 'version-test', scope: 'global', version: '1' },
      async (request) => {
        return new CallResponse(
          {
            code: 200,
            data: { version: '1' },
            success: true,
          },
          request,
        )
      },
    )

    server.registerHandler(
      { method: 'version-test', scope: 'global', version: '2' },
      async (request) => {
        return new CallResponse(
          {
            code: 200,
            data: { version: '2' },
            success: true,
          },
          request,
        )
      },
    )

    server.start()

    try {
      const noVersionSpecified = await axios.post('http://localhost:6789', {
        method: 'version-test',
      })

      expect(noVersionSpecified.data.version).toEqual('1')

      const one = await axios.post('http://localhost:6789', {
        method: 'version-test',
        version: '1',
      })

      expect(one.data.version).toEqual('1')

      const two = await axios.post('http://localhost:6789', {
        method: 'version-test',
        version: '2',
      })

      expect(two.data.version).toEqual('2')
    } finally {
      server.stop()

      await new Promise((r) => setTimeout(r, 1000))
    }
  })

  it('provides a "call" method to make internal RPC calls', async () => {
    const server = new RPCServer({
      displayName: 'test',
      ephemeralId: Math.random().toString(),
    })

    server.registerHandler(
      { method: 'local', scope: 'global', version: '1' },
      async (request) => {
        if (request.args) {
          return {
            code: 200,
            data: { version: '1' },
            success: true,
          }
        } else {
          return {
            code: 422,
            success: false,
          }
        }
      },
    )

    try {
      await server.call(
        {
          args: false,
          method: 'local',
          scope: 'global',
          version: '1',
        },
        'test',
      )
    } catch (e: any) {
      expect(e.code).toEqual(422)
      expect(e.success).toBeFalsy()
    }

    const { code, success } = await server.call(
      {
        args: true,
        method: 'local',
        scope: 'global',
        version: '1',
      },
      'test',
    )

    expect(code).toEqual(200)
    expect(success).toBeTruthy()
  })

  it('registerHandler() provides a "call" method to the handler as 2nd param', async () => {
    const server = new RPCServer({
      displayName: 'test',
      ephemeralId: Math.random().toString(),
    })

    server.registerHandler(
      { method: 'local_1', scope: 'global', version: '1' },
      async (request, call) => {
        expect(request.identity?.authorization).toEqual('123')

        // call another handler internally that returns the original request's identity
        const local2Response = await call({
          method: 'local_2',
          scope: 'global',
          version: '1',
        })

        return {
          code: 200,
          data: local2Response.data,
          success: true,
        }
      },
    )

    server.registerHandler(
      { internal: true, method: 'local_2', scope: 'global', version: '1' },
      async (request) => ({
        code: 200,
        data: request.identity,
        success: true,
      }),
    )

    const { data } = await server.call(
      {
        args: true,
        identity: {
          authorization: '123',
        },
        method: 'local_1',
        scope: 'global',
        version: '1',
      },
      'test',
    )

    expect(data).toMatchObject({
      authorization: '123',
    })
  })

  it('onHandlerError option handles errors', async () => {
    const server = new RPCServer({
      displayName: 'test',
      handlers: {
        onHandlerError: (error: any, request) => {
          return {
            code: 599, //arbitrary code for test
            data: request.method,
            success: false,
            message: error.message,
          }
        },
      },
      ephemeralId: Math.random().toString(),
    })

    server.registerHandler(
      { method: 'error', scope: 'global', version: '1' },
      async (req) => {
        if (req.args) {
          return {
            code: 200,
            success: true,
          }
        }

        throw new Error('some-error')
      },
    )

    try {
      await server.call(
        {
          args: false,
          method: 'error',
          scope: 'global',
          version: '1',
        },
        'test',
      )
    } catch (e: any) {
      expect(e.code).toEqual(599)
      expect(e.data).toEqual('error')
      expect(e.message).toEqual('some-error')
      expect(e.success).toBeFalsy()
    }

    const { code, success } = await server.call(
      {
        args: true,
        method: 'error',
        scope: 'global',
        version: '1',
      },
      'test',
    )

    expect(code).toEqual(200)
    expect(success).toBeTruthy()
  })

  // this was removed and needs reimplementation for performance concerns using EventEmitter API
  // it('allows event listener', (done) => {
  //   const server = new RPCServer({
  //     displayName: 'test',
  //     ephemeralId: Math.random().toString(),
  //   })
  //
  //   const requestInfo = { method: 'test', scope: 'test', version: '1' }
  //
  //   server.registerHandler(requestInfo, async (request) => {
  //     throw new Error('some error')
  //   })
  //
  //   const unsubscribed = server.on(
  //     RPCServer.events.handler_error,
  //     (payload) => {
  //       expect(payload.error).toBeInstanceOf(Error)
  //       done()
  //     },
  //   )
  //
  //   server.call(requestInfo, 'test').catch()
  // })
})
