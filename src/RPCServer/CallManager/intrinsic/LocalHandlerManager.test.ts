import { LocalHandlerManager } from './LocalHandlerManager'
import { EventBus } from '../../../EventBus/EventBus'
import { CallResponse } from '../../../CallResponse'
import { CallRequest } from '../../../CallRequest'

describe('LocalHandlerManager', () => {
  const config = {
    displayName: 'test',
    ephemeralId: 'test',
  }

  it('can instantiate', () => {
    const localHandlManager = new LocalHandlerManager({
      config,
      eventBus: new EventBus(),
    })

    expect(localHandlManager).toBeDefined()
  })

  it('can register a handler', () => {
    const localHandlManager = new LocalHandlerManager({
      config,
      eventBus: new EventBus(),
    })

    const requestRegInfo = {
      method: 'test',
      scope: 'local-handler-manager',
      version: '1',
    }

    localHandlManager.registerHandler(requestRegInfo, (request) => {
      return new CallResponse({ code: 200, success: true }, request)
    })

    expect(localHandlManager.checkCanHandleRequest(requestRegInfo)).toBeTruthy()
  })

  it('can manage a request', async () => {
    const localHandlManager = new LocalHandlerManager({
      config,
      eventBus: new EventBus(),
    })

    const requestRegInfo = {
      method: 'test',
      scope: 'local-handler-manager',
      version: '1',
    }

    localHandlManager.registerHandler(requestRegInfo, (request) => {
      return new CallResponse({ code: 200, success: true }, request)
    })

    try {
      const { success } = await localHandlManager.manageRequest(
        CallRequest.fromCallRequestDTO(requestRegInfo, {
          trace: { caller: 'test' },
        }),
      )

      expect(success).toBeTruthy()
    } catch (e) {
      expect(e).toBeUndefined()
    }
  })

  it('will perform JSON-Schema validations when "args" are present', async () => {
    const localHandlManager = new LocalHandlerManager({
      config,
      eventBus: new EventBus(),
    })

    localHandlManager.registerHandler(
      {
        args: {
          properties: {
            name: { type: 'string' },
          },
          required: ['name'],
          type: 'object',
        },
        method: 'test',
        scope: 'local-handler-manager',
        version: '1',
      },
      (request) => {
        return new CallResponse({ code: 200, success: true }, request)
      },
    )

    try {
      const { success } = await localHandlManager.manageRequest(
        CallRequest.fromCallRequestDTO(
          {
            method: 'test',
            scope: 'local-handler-manager',
            version: '1',
          },
          { trace: { caller: 'test' } },
        ),
      )

      expect(success).toBeFalsy()
    } catch (e) {
      expect(e).toBeUndefined()
    }
  })

  it('will crash when invalid JSON-Schema "args" are passed to registration', async () => {
    const realProcess = process
    const exitMock = jest.fn()

    // We assign all properties of the "real process" to
    // our "mock" process, otherwise, if "myFunc" relied
    // on any of such properties (i.e `process.env.NODE_ENV`)
    // it would crash with an error like:
    // `TypeError: Cannot read property 'NODE_ENV' of undefined`.
    // @ts-ignore
    global.process = { ...realProcess, exit: exitMock }

    const localHandlManager = new LocalHandlerManager({
      config,
      eventBus: new EventBus(),
    })

    try {
      localHandlManager.registerHandler(
        {
          args: {
            properties: {
              name: { type: 'string' },
            },
            required: { 'this-should-be-an-array': '' },
            type: 'not-a-real-property',
          },
          method: 'test',
          scope: 'local-handler-manager',
          version: '1',
        },
        (request) => {
          return new CallResponse({ code: 200, success: true }, request)
        },
      )
    } catch (e) {
      expect(exitMock).toHaveBeenCalledWith(1)
      global.process = realProcess
    }
  })
})
