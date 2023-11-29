import Ajv from 'ajv'
import { CallRequest, ICallRequestDescription } from '../../../CallRequest'
import {
  Handler,
  HandlerRegistrationInfo,
  HandlerRequestValidator,
} from '../../../Handler'
import { CallResponse } from '../../../CallResponse'
import { makeHandlerRequestKey } from './utils/make-handler-request-key'
import Debug from 'debug'
import { EventBus } from '../../../EventBus/EventBus'
import { RPCEventTopics } from '../../Events'
import { RPCServerConfig } from '../../RPCServer'

const ajv = new Ajv({
  coerceTypes: 'array',
  removeAdditional: true,
  useDefaults: true, // ie: convert { name: null } to { name: "" } if the the name=string type
})

const debug = Debug('rpc:LocalHandlerManager')

interface LocalHandlerManagerOptions {
  config: RPCServerConfig
  eventBus: EventBus
}

export interface LocalHandlerManager {
  checkCanHandleRequest(request: ICallRequestDescription): boolean

  registerHandler(request: HandlerRegistrationInfo, handler: Handler): void
}

export class LocalHandlerManager {
  private eventBus: EventBus

  constructor(readonly options: LocalHandlerManagerOptions) {
    this.eventBus = options.eventBus
  }

  private handlersByHandlerRequestKey: {
    [key: string]: { internalOnly: boolean; handler: Handler }
  } = {}

  private handlerRequestValidationsByHandlerRequestKey: {
    [key: string]: HandlerRequestValidator
  } = {}

  checkCanHandleRequest = (request: ICallRequestDescription): boolean => {
    return !!this.handlersByHandlerRequestKey[makeHandlerRequestKey(request)]
  }

  getRegisteredHandlers = (): string[] => {
    return Object.keys(this.handlersByHandlerRequestKey)
  }

  getSimilarRegisteredMethods = (
    request: ICallRequestDescription,
  ): string => {
    const rgx = new RegExp(request.method)

    return Object.keys(this.handlersByHandlerRequestKey)
      .filter((key) => {
        return rgx.test(key)
      })
      .join(', ')
  }

  manageRequest = async (request: CallRequest): Promise<CallResponse> => {
    debug('manageRequest', request)

    try {
      const key = makeHandlerRequestKey(
        CallRequest.toCallRequestDescription(request),
      )

      if (
        this.handlersByHandlerRequestKey[key].internalOnly &&
        !request.trace.internal
      ) {
        debug(
          'handler is marked "internalOnly" and the request is not coming from internal',
          request,
        )

        throw new CallResponse(
          {
            code: 403,
            message: 'caller is not authorized to access this RPC',
            success: false,
          },
          request,
        )
      }

      if (this.handlerRequestValidationsByHandlerRequestKey[key]) {
        this.handlerRequestValidationsByHandlerRequestKey[key](request)
      }

      return await this.handlersByHandlerRequestKey[key].handler(request)
    } catch (e: any) {
      if (CallResponse.isCallResponse(e)) {
        return e
      } else if (CallResponse.isCallResponseDTO(e)) {
        return new CallResponse(e, request)
      }

      console.log('LocalHandlerManager error: catching and returning 500', e)

      return new CallResponse(
        {
          code: 500,
          success: false,
        },
        request,
      )
    }
  }

  registerHandler = (request: HandlerRegistrationInfo, handler: Handler) => {
    debug('registerHandler', request)

    const key = makeHandlerRequestKey(request)

    this.handlersByHandlerRequestKey[key] = {
      internalOnly: !!request.internal,
      handler,
    }

    // Check if the HandlerRegistrationInfo has "args" as JSON-schema for automatic validation
    if (typeof request.args === 'object' && request.args?.type) {
      try {
        const validate = ajv.compile(request.args)

        this.handlerRequestValidationsByHandlerRequestKey[key] = (request) => {
          const valid = validate(request.args || {})

          if (!valid) {
            debug('validation error', validate.errors)

            throw new CallResponse(
              {
                code: 422,
                message: `"args" validation failed: ${validate.errors
                  ?.map((errorObj) => errorObj.instancePath + errorObj.message)
                  .join(', ')}`,
                success: false,
              },
              request,
            )
          }

          return undefined
        }
      } catch (e: any) {
        console.log(``)
        console.log(`ERROR: Unable to compile JSON-schema for "${key}"`)
        console.log(`   ${e.message}`)
        console.log(``)
        // do not throw, exist the process, tests expect this impl
        process.exit(1)
      }
    }
  }
}
