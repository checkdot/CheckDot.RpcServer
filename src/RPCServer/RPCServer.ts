import { Handler, HandlerRegistrationInfo, RPCServerHandler } from '../Handler'
import {
  CallRequest,
  ICallRequestDescription,
  ICallRequestDTO,
} from '../CallRequest'
import { CallManager } from './CallManager/CallManager'
import { HttpServer } from './GatewayServers/HttpServer'
import {
  TClientMessageHandler,
  WebSocketServer,
} from './GatewayServers/WebSocketServer'
import { EventBus } from '../EventBus/EventBus'
import { deepFreeze } from '../utils/deep-freeze'
import { TelemetryInfoManager } from './Telemetry/TelemetryInfoManager'
import ObjectId from 'bson-objectid'
import { CallResponse, ICallResponseDTO } from '../CallResponse'
import Debug from 'debug'
import { makeHandlerRequestKey } from './CallManager/intrinsic/utils/make-handler-request-key'
import { RPCEventTopics } from './Events'
import { RPCClientIdentity } from '../RPCClientIdentity'

const debug = Debug('rpc:RPCServer')

export interface RPCServerConfig {
  debug?: boolean

  // This property is important for telemetry & used for telemetry docs. This property will
  // be used to display and overwrite telemetry docs and overwrite any previously connected servers with the
  // same displayName property
  displayName: string

  // Optional unique id for a server instance. Used inside the internal network for communication
  // and identification.gs
  ephemeralId: string

  handlers?: {
    /**
     * Called when a handler throws an error
     * @param error
     */
    onHandlerError?: (
      error: unknown,
      request: CallRequest
    ) => CallResponse | ICallResponseDTO | undefined | void

    /**
     * Called when a registered handler is done processing a request
     * @param request {CallRequest}
     * @param startRequestReturnValue {any} If the onHandlerStartRequest returned anything it will be available in this param
     */
    onHandlerEndRequest?: (
      request: CallRequest,
      startRequestReturnValue?: any,
    ) => void
    /**
     * Called when a registered handler starts processing a request
     * @param request
     */
    onHandlerStartRequest?: (request: CallRequest) => any
  }

  messageBroker?: {
    amqpURI?: string
    kafka?: string // not implemented
    redis?: string // not implemented
  }

  gatewayServer?: {
    http?: {
      bind?: string
      port: number
    }

    websocket?: {
      bind?: string
      onClientConnect?: (connection: {
        connectionId: string
        identity?: RPCClientIdentity
        ip?: string
      }) => void
      onClientConnectionIdentityChanged?: (connection: {
        connectionId: string
        identity?: RPCClientIdentity
        ip?: string
      }) => void
      onClientDisconnect?: (connection: {
        connectionId: string
        identity?: RPCClientIdentity
        ip?: string
      }) => void
      onClientMessage?: TClientMessageHandler
      port: number
    }
  }

  telemetry?: {
    adapter: {
      mongoURI: string
    }
    /** When `true` RPC call-time stats will be persisted to the telemetry DB */
    saveRPCStatistics?: boolean
  }
}

export class RPCServer {
  readonly eventBus: EventBus = new EventBus()
  static readonly events = {
    ...RPCEventTopics,
  }

  private callManager: CallManager
  private config: RPCServerConfig
  private httpServer?: HttpServer
  private serverStarted = false
  private telemetryManager?: TelemetryInfoManager
  private websocketServer?: WebSocketServer

  constructor(config: RPCServerConfig) {
    if (!config.ephemeralId) {
      config.ephemeralId = new ObjectId().toString()
    }

    this.config = deepFreeze<RPCServerConfig>(config)

    if (!config.displayName) {
      throw new Error('config.displayName is required')
    }

    if (config.telemetry) {
      this.telemetryManager = new TelemetryInfoManager({
        config: this.config,
        eventBus: this.eventBus,
      })
    }

    this.callManager = new CallManager({
      config: this.config,
      eventBus: this.eventBus,
      telemetryManager: this.telemetryManager,
    })

    debug(`RPCServer id: ${this.config.ephemeralId}`)

    this.setupGatewayServer()
  }

  call = async (
    request: ICallRequestDTO,
    traceCaller: string,
  ): Promise<CallResponse> => {
    if (!traceCaller) {
      throw Error(
        'RPCServer.call() requires "traceCaller" param string to track where this call originated',
      )
    }

    const response = await this.callManager.manageRequest(
      CallRequest.fromCallRequestDTO(request, {
        trace: {
          caller: `RPCServer.call ${traceCaller}`,
          internal: true,
        },
      }),
    )

    if (!response.success) {
      throw response
    }

    return response
  }

  getRegisteredHandlers = () => this.callManager.getRegisteredHandlers()

  on = (topic: string, cb: (payload: any) => void) => {
    // only allow exposed events to be subscribed to
    if (Object.keys(RPCEventTopics).includes(topic)) {
      const { unsubscribe } = this.eventBus.subscribe(topic, cb)

      return () => unsubscribe()
    } else {
      throw new Error(`Error topic "${topic}" not recognized`)
    }
  }

  /**
   * Register a handler for this RPCServer to handle and manage requests to/from.
   *
   * The handler callback provides an "call" method for registered handlers to make calls to other RPC handlers in
   * the same network. The incoming CallRequest's RPCClientIdentity will be used when making subsequent calls.
   *
   * @param request
   * @param handler
   */
  registerHandler = <Args = any, Data = any>(
    request: HandlerRegistrationInfo,
    handler: RPCServerHandler<Args, Data>,
  ) => {
    if (this.serverStarted) {
      throw Error(
        'RPCServer: you cannot register a handler after the server has started.',
      )
    }

    // wrap the handler so handler implementations can return a POJO
    const wrappedHandler: Handler = async (request: CallRequest) => {
      try {
        let callResponse: CallResponse
        const originalRequest = request
        const reqKey = makeHandlerRequestKey(
          originalRequest as ICallRequestDescription,
        )

        debug(`wrappedHandler, Handler -> ${reqKey}`, {
          args: request.args,
          identity: request.identity,
          trace: request.trace,
        })

        const internalCallWithCallerIdentity = (request: ICallRequestDTO) => {
          return this.call(
            { identity: originalRequest.identity, ...request },
            makeHandlerRequestKey(originalRequest as ICallRequestDescription),
          )
        }

        const handlerResponse = await handler(
          request,
          internalCallWithCallerIdentity,
        )

        if (handlerResponse instanceof CallResponse) {
          callResponse = handlerResponse
        } else if (
          typeof handlerResponse === 'object' &&
          handlerResponse !== null &&
          'code' in handlerResponse &&
          'success' in handlerResponse
        ) {
          callResponse = new CallResponse(handlerResponse, request)
        } else {
          console.log(
            new Error(
              `${reqKey} handler did not return a valid CallResponse or CallResponseDTO, "success" and "code" properties are required.`,
            ),
          )

          throw {
            code: 500,
            message: `RPC handler error`,
            success: false,
          }
        }

        if (!callResponse.success) {
          throw callResponse
        }

        return callResponse
      } catch (e: any) {
        debug(
          `wrappedHandler, caught error for request ${makeHandlerRequestKey(
            request,
          )}`,
          e,
        )

        if (CallResponse.isCallResponse(e)) {
          return e
        } else if (CallResponse.isCallResponseDTO(e)) {
          return new CallResponse(e, request)
        } else if (this.config.handlers?.onHandlerError) {
          try {
            const onHandlerErrorResult = this.config.handlers.onHandlerError(e, request)

            if (onHandlerErrorResult) {
              if (onHandlerErrorResult instanceof CallResponse) {
                return onHandlerErrorResult
              }

              if (CallResponse.isCallResponseDTO(onHandlerErrorResult)) {
                return new CallResponse(onHandlerErrorResult, request)
              }
            }
          } catch (e: any) {
            console.log(
              'LocalHandlerManager catch and call RPCService optional onHandlerError() error',
              e,
            )
          }
        }

        console.log('RPCServer wrappedHandler error: ', e, request)

        return new CallResponse(
          { code: 500, message: 'server handler issue', success: false },
          request,
        )
      }
    }

    this.callManager.registerHandler(request, wrappedHandler)
    this.telemetryManager?.registerHandler(request)
  }

  /**
   * Send a message to a specific RPC client by connectionId.
   * @param connectionId
   * @param data
   */
  sendMessageToClient = (connectionId: string, data: any) => {
    if (this.websocketServer) {
      this.websocketServer.sendMessageToClient(connectionId, data)
    }
  }

  start = () => {
    if (!this.serverStarted) {
      this.serverStarted = true
      this?.httpServer?.start()
      this?.websocketServer?.start()
      this?.telemetryManager?.startTelemetryReporting()
    } else {
      throw Error('RPCServer: cannot call start() more than once')
    }
  }

  stop = () => {
    this?.httpServer?.stop()
    this?.websocketServer?.stop()
  }

  private setupGatewayServer = () => {
    const config = this.config

    if (!config?.messageBroker && !config.gatewayServer) {
      debug(
        'no config.messageBroker or config.gatewayServer options, acting as standalone server',
      )
    }

    if (config?.gatewayServer?.http) {
      this.httpServer = new HttpServer({
        config: this.config,
        eventBus: this.eventBus,
      })

      this.httpServer.setIncomingRequestHandler(this.callManager.manageRequest)
    }

    if (config?.gatewayServer?.websocket) {
      this.websocketServer = new WebSocketServer({
        config: this.config,
        eventBus: this.eventBus,
      })

      this.websocketServer.setIncomingRequestHandler(
        this.callManager.manageRequest,
      )
    }
  }
}
