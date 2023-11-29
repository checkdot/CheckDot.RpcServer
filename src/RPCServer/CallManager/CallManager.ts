import { CallRequest, ICallRequestDescription } from '../../CallRequest'
import { CallResponse } from '../../CallResponse'
import { LocalHandlerManager } from './intrinsic/LocalHandlerManager'
import { MessageBrokerManager } from './intrinsic/MessageBroker/MessageBrokerManager'
import { RPCServerConfig } from '../RPCServer'
import { EventBus } from '../../EventBus/EventBus'
import { Handler } from '../../Handler'
import Debug from 'debug'
import { makeHandlerRequestKey } from './intrinsic/utils/make-handler-request-key'
import { TelemetryInfoManager } from '../Telemetry/TelemetryInfoManager'

const debug = Debug('rpc:CallManager')

export interface CallManager {
  checkCanHandleRequest(request: ICallRequestDescription): boolean

  manageRequest(request: CallRequest): Promise<CallResponse>
}

interface CallManagerOptions {
  config: RPCServerConfig
  eventBus: EventBus
  telemetryManager?: TelemetryInfoManager
}

export class CallManager {
  private localHandlerManager: LocalHandlerManager
  private messageBrokerManager?: MessageBrokerManager

  constructor(readonly options: CallManagerOptions) {
    this.localHandlerManager = new LocalHandlerManager({
      config: options.config,
      eventBus: options.eventBus,
    })

    if (options.config?.messageBroker) {
      this.messageBrokerManager = new MessageBrokerManager({
        config: options.config,
        eventBus: options.eventBus,
        requestHandler: this.manageRequest,
      })
    }
  }

  getRegisteredHandlers = () => this.localHandlerManager.getRegisteredHandlers()

  manageRequest = async (request: CallRequest): Promise<CallResponse> => {
    const startTime = Date.now()

    const localHandler = this.localHandlerManager.checkCanHandleRequest(
      CallRequest.toCallRequestDescription(request),
    )

    debug('manageRequest', request)

    const startRequestValue =
      this.options.config.handlers?.onHandlerStartRequest?.(request)

    if (localHandler) {
      debug('manageRequest, local handler found')

      return this.localHandlerManager.manageRequest(request).finally(() => {
        this.options.config.handlers?.onHandlerEndRequest?.(
          request,
          startRequestValue,
        )
      })
    }

    if (this.messageBrokerManager) {
      debug('manageRequest, sending to MessageBrokerManager')

      return this.messageBrokerManager.manageRequest(request).finally(() => {
        this.options.config.handlers?.onHandlerEndRequest?.(
          request,
          startRequestValue,
        )
      })
    } else {
      debug(
        `no messageBrokerManager found to proxy request, returning 501 no handler found (not implemented) for ${makeHandlerRequestKey(
          request,
        )}`,
      )

      this.options.config.handlers?.onHandlerEndRequest?.(
        request,
        startRequestValue,
      )

      return new CallResponse(
        {
          code: 501,
          message: `No method handler found for scope=${
            request.scope
          }, method=${request.method}, version=${
            request.version
          }. Trace info: caller=${request.trace.caller} internal=${!!request
            .trace.internal}`,
          success: false,
        },
        request,
      )
    }
  }

  registerHandler = (request: ICallRequestDescription, handler: Handler) => {
    this.localHandlerManager.registerHandler(request, handler)

    if (this.messageBrokerManager) {
      this.messageBrokerManager.registerHandler(request)
    }
  }
}
