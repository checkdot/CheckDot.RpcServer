import { CallManager } from './CallManager'
import { CallResponse } from '../../CallResponse'
import { CallRequest } from '../../CallRequest'
import { EventBus } from '../../EventBus/EventBus'

describe('CallManager', () => {
  const rpcsServerOptions = {
    config: {
      displayName: 'test',
      ephemeralId: Math.random().toString(),
    },
    eventBus: new EventBus(),
  }

  it('can instantiate', () => {
    new CallManager(rpcsServerOptions)
  })

  it('can register request handler', () => {
    const rpcsServer = new CallManager(rpcsServerOptions)

    const handler = (request: CallRequest) =>
      Promise.resolve(CallResponse.EMPTY)

    rpcsServer.registerHandler(
      { method: 'call-mgr', scope: 'call-manager', version: '1' },
      handler,
    )
  })

  it('can manage a request with local handler', async () => {
    const rpcsServer = new CallManager(rpcsServerOptions)

    const responseObj = {
      code: 200,
      data: [],
      message: 'good',
      success: true,
    }

    const handler = (request: CallRequest) => {
      return Promise.resolve(new CallResponse(responseObj, request))
    }

    const request = {
      method: 'call-mgr',
      scope: 'call-manager',
      version: '1',
    }

    rpcsServer.registerHandler(request, handler)

    const response = await rpcsServer.manageRequest(
      CallRequest.fromCallRequestDTO(request, { trace: { caller: 'test' } }),
    )

    const responseDTO = CallResponse.toCallResponseDTO(response)

    expect(responseDTO).toEqual([])
  })

  it('catches a thrown CallResponse', async () => {
    const rpcsServer = new CallManager(rpcsServerOptions)

    const handler = async (request: CallRequest) => {
      throw new CallResponse({ code: 400, success: false }, request)

      return Promise.resolve(
        new CallResponse({ code: 200, success: true }, request),
      )
    }

    const request = {
      method: 'call-mgr',
      scope: 'call-manager',
      version: '1',
    }

    rpcsServer.registerHandler(request, handler)

    const response = await rpcsServer.manageRequest(
      CallRequest.fromCallRequestDTO(request, { trace: { caller: 'test' } }),
    )

    const responseDTO = CallResponse.toCallResponseDTO(response)

    expect(responseDTO).toEqual({})
  })

  it('catches a throws and will make a valid response', async () => {
    const rpcsServer = new CallManager(rpcsServerOptions)

    // a custom class that will be thrown
    class RPCHandlerError {
      code: number
      data?: any
      message: string
      success: boolean = false

      constructor(response: { code?: number; data?: any; message?: string }) {
        this.code = response.code || 500
        this.message = response.message || 'The was a RPC handler error'
      }
    }

    const handler = async (request: CallRequest) => {
      throw new RPCHandlerError({ code: 400, message: 'thrown thing' })

      return Promise.resolve(
        new CallResponse({ code: 200, success: true }, request),
      )
    }

    const request = {
      method: 'call-mgr-throw',
      scope: 'call-manager',
      version: '1',
    }

    rpcsServer.registerHandler(request, handler)

    const response = await rpcsServer.manageRequest(
      CallRequest.fromCallRequestDTO(request, { trace: { caller: 'test' } }),
    )

    const responseDTO = CallResponse.toCallResponseDTO(response)

    expect(responseDTO).toEqual({})
  })

  it('prevents non-internal calls from getting to internal handlers', async () => {
    const rpcsServer = new CallManager(rpcsServerOptions)

    const handler = async (request: CallRequest) => {
      return Promise.resolve(
        new CallResponse({ code: 200, success: true }, request),
      )
    }

    const internalRequest = {
      method: 'call-mgr-internal',
      scope: 'call-manager',
      version: '1',
    }

    const publicRequest = {
      method: 'call-mgr-public',
      scope: 'call-manager',
      version: '1',
    }

    rpcsServer.registerHandler({ internal: true, ...internalRequest }, handler)
    rpcsServer.registerHandler(publicRequest, handler)

    const internalResponse = await rpcsServer.manageRequest(
      CallRequest.fromCallRequestDTO(internalRequest, {
        trace: { caller: 'test' },
      }),
    )

    const publicResponse = await rpcsServer.manageRequest(
      CallRequest.fromCallRequestDTO(publicRequest, {
        trace: { caller: 'test' },
      }),
    )

    const internalResponseDTO = CallResponse.toCallResponseDTO(internalResponse)
    const publicResponseDTO = CallResponse.toCallResponseDTO(publicResponse)

    expect(internalResponseDTO).toMatchObject({})

    expect(publicResponseDTO).toMatchObject({})
  })

  it('calls start/end lifecycles for handlers', (done) => {
    const requestInfo = {
      method: 'call-mgr-tracing-handlers',
      scope: 'call-manager',
      version: '1',
    }

    const callMgr = new CallManager({
      ...rpcsServerOptions,
      config: {
        ...rpcsServerOptions.config,
        handlers: {
          onHandlerEndRequest: (request, startValue) => {
            expect(request).toMatchObject(requestInfo)
            expect(startValue).toEqual('trace_id')
            done()
          },
          onHandlerStartRequest: (request) => {
            expect(request).toMatchObject(requestInfo)
            return 'trace_id'
          },
        },
      },
    })

    callMgr.registerHandler(requestInfo, (request: CallRequest) => {
      return Promise.resolve(
        new CallResponse({ code: 200, success: true }, request),
      )
    })

    callMgr.manageRequest(
      CallRequest.fromCallRequestDTO(requestInfo, {
        trace: { caller: 'test' },
      }),
    )
  })
})
