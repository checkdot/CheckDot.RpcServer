import WsServer from 'ws'
import { DEFAULT_BIND, Server } from './Server'
import { Handler } from '../../Handler'
import { RPCServerConfig } from '../RPCServer'
import { EventBus } from '../../EventBus/EventBus'
import Debug from 'debug'
import { CallRequest, ICallRequestDTO } from '../../CallRequest'
import { CallResponse } from '../../CallResponse'
import { RPCClientIdentity, isIdentityValid } from '../../RPCClientIdentity'
import { IncomingMessage } from 'http'
import uuid from 'node-uuid'
import WebSocket from 'ws'
import { isEqual } from 'lodash'

const debug = Debug('rpc:WebSocketServer')

export type TClientMessageHandler = (
  clientMsgHandler: IWebSocketClientMessage & { connectionId: string },
) => void

interface IWebSocketClientMessage {
  clientMessage: any
  identity?: RPCClientIdentity
}

interface ExtendedWebSocket extends WebSocket {
  id: string
}

interface WebSocketServerOptions {
  config: RPCServerConfig
  eventBus: EventBus
}

export class WebSocketServer implements Server {
  private bind: string
  private clientMessageHandlers: TClientMessageHandler[] = []
  private connectionsByConnectionId = new Map<string, ExtendedWebSocket>()
  private eventBus: EventBus
  private port: number
  private requestHandler?: Handler
  private wss?: WsServer.Server

  constructor(readonly options: WebSocketServerOptions) {
    if (!options.config.gatewayServer?.websocket?.port) {
      throw new Error('config.gatewayServer.websocket.port is required')
    }

    this.bind = options.config.gatewayServer?.websocket?.bind || DEFAULT_BIND
    this.eventBus = options.eventBus
    this.port = options.config.gatewayServer?.websocket?.port

    if (options.config.gatewayServer.websocket.onClientMessage) {
      this.clientMessageHandlers.push(
        options.config.gatewayServer.websocket.onClientMessage,
      )
    }
  }

  name = 'WebSocketServer'

  private static parseIPAddressFromWsReq(req: IncomingMessage): string {
    let ip = ''

    if (req.headers['x-real-ip']) {
      if (Array.isArray(req.headers['x-real-ip'])) {
        ip = req.headers['x-real-ip'][0]
      } else {
        ip = req.headers['x-real-ip'].split(',')[0]
      }
    } else {
      ip = req.socket.remoteAddress || ''
    }

    ip = ip.trim()

    return ip
  }

  /**
   * This method allows adding a callback for websocket client messages to be handled that are not RPC requests.
   * @param handler
   */
  addClientMessageHandler = (handler: TClientMessageHandler) => {
    this.clientMessageHandlers.push(handler)
  }

  removeClientMessageHandler = (handler: TClientMessageHandler) => {
    const indexToRemove = this.clientMessageHandlers.findIndex(
      (func) => func === handler,
    )

    if (indexToRemove > -1) {
      this.clientMessageHandlers.splice(indexToRemove, 1)
    }
  }

  setIncomingRequestHandler = (requestHandler: Handler) => {
    this.requestHandler = requestHandler
  }

  sendMessageToClient = (connectionId: string, data: any) => {
    const ws = this.connectionsByConnectionId.get(connectionId)

    if (ws) {
      let serverMessage

      try {
        serverMessage = JSON.stringify({ serverMessage: data })
      } catch (e) {
        console.log(
          'WebSocketServer.sendMessageToClient() error stringify serverMessage to send to client: ',
          serverMessage,
        )
      }

      if (serverMessage) {
        ws.send(serverMessage)
      }
    }
  }

  start = (onStartedCallback?: () => void) => {
    if (!this.requestHandler) {
      throw new Error(`No request handler has be set`)
    }

    this.wss = new WsServer.Server({
      host: this.bind,
      port: this.port,
    })

    this.wss.on('connection', (ws: ExtendedWebSocket, req) => {
      const websocketId = uuid.v4()

      this.connectionsByConnectionId.set(websocketId, ws)

      debug('websocket connected, connectionId:', websocketId)

      let identity: RPCClientIdentity | undefined
      const wsIp = WebSocketServer.parseIPAddressFromWsReq(req)

      if (this.options.config?.gatewayServer?.websocket?.onClientConnect) {
        this.options.config.gatewayServer.websocket.onClientConnect({
          connectionId: websocketId,
          identity,
          ip: wsIp,
        })
      }

      ws.on('close', (code, data) => {
        this.connectionsByConnectionId.delete(websocketId)

        const reason = data.toString()

        debug('websocket disconnected, connectionId:', websocketId, reason)

        if (this.options.config?.gatewayServer?.websocket?.onClientDisconnect) {
          this.options.config.gatewayServer.websocket.onClientDisconnect({
            connectionId: websocketId,
            identity,
            ip: wsIp,
          })
        }
      })

      // when there is a client connection we need to handle it so it's not fatal
      ws.on('error', console.error)

      ws.on('message', async (data: WsServer.Data, isBinary: boolean) => {
        const message = isBinary ? data : data.toString()

        debug('received message from WS, connectionId:', websocketId, message)

        let messageParsed

        if (typeof message === 'string') {
          try {
            messageParsed = JSON.parse(message)
          } catch (e: any) {
            debug(
              'WebSocketServer error: received unparseable WS msg string',
              message,
            )

            return
          }
        } else {
          debug(
            'WebSocketServer error: received unknown "message" from client',
            message,
          )
        }

        const incomingMessage: ICallRequestDTO | IWebSocketClientMessage =
          messageParsed

        if (incomingMessage.identity) {
          if (!isIdentityValid(incomingMessage.identity)) {
            console.log(
              'error receiving CallResponseDTO with invalid identity schema',
              incomingMessage.identity,
            )

            return
          }

          if (
            identity?.authorization &&
            identity.authorization !== incomingMessage.identity.authorization
          ) {
            console.log(
              'error, a websocket changed identity.authorization from previous value, disconnecting...',
            )

            ws.send(
              JSON.stringify(
                CallResponse.toCallResponseDTO(
                  new CallResponse(
                    {
                      code: 400,
                      message:
                        'identity.authorization has changed - disconnecting websocket connection',
                      success: false,
                    },
                    CallRequest.fromCallRequestDTO(
                      {
                        ...incomingMessage,
                        // we add a method because CallRequest.fromCallRequestDTO requires a method on incoming RPC's
                        method: '__internal-identity__',
                      },
                      { trace: { caller: 'WebSocketServer' } },
                    ),
                  ),
                ),
              ),
              () => ws.close(),
            )

            return
          }

          if (incomingMessage.identity) {
            if (
              this.options.config?.gatewayServer?.websocket
                ?.onClientConnectionIdentityChanged
            ) {
              if (!isEqual(incomingMessage.identity, identity)) {
                this.options.config.gatewayServer.websocket.onClientConnectionIdentityChanged(
                  {
                    connectionId: websocketId,
                    identity: incomingMessage.identity,
                    ip: wsIp,
                  },
                )
              }
            }
          }

          identity = incomingMessage.identity
        }

        if ('clientMessage' in incomingMessage) {
          this.clientMessageHandlers.forEach((msgHandler) => {
            try {
              msgHandler({
                ...incomingMessage,
                connectionId: websocketId,
                identity,
              })
            } catch (err) {
              console.log(
                'error calling clientMessageHandler() with incoming websocket client msg',
                err,
              )
            }
          })

          return
        }

        const requestDTO: ICallRequestDTO = incomingMessage

        // This is just a "set my identity" msg from the client
        if (!requestDTO.method && requestDTO.identity) {
          try {
            const response = new CallResponse(
              {
                code: 200,
                correlationId: requestDTO.correlationId,
                success: true,
              },
              CallRequest.fromCallRequestDTO(
                {
                  ...requestDTO,
                  // we add a method because CallRequest.fromCallRequestDTO requires a method on incoming RPC's
                  method: '__internal-set-identity__',
                },
                { trace: { caller: 'WebSocketServer' } },
              ),
            )

            ws.send(JSON.stringify(CallResponse.toCallResponseDTO(response)))
          } catch (e: any) {
            console.log(
              'error sending CallResponseDTO to WS connection after setting RPCClientIdentity, error:',
              e,
            )
          }

          return
        }

        let request: CallRequest | undefined

        try {
          request = CallRequest.fromCallRequestDTO(
            { identity, ...requestDTO },
            { trace: { caller: 'WebSocketServer', ipAddress: wsIp } },
          )
        } catch (e: any) {
          debug(
            'WebSocketServer error: WS msg not a valid CallRequestDTO',
            request,
            e,
          )

          return
        }

        if (request) {
          debug('handling received request')

          if (request.identity) {
            if (!isIdentityValid(request.identity)) {
              console.log(
                'error recieving CallResponseDTO with invalid RPCClientIdentity schema',
                request.identity,
              )

              return
            }

            identity = request.identity
          }

          const response = await this.handleIncomingRequest(request)

          debug('returning request response')

          try {
            ws.send(JSON.stringify(CallResponse.toCallResponseDTO(response)))
          } catch (e: any) {
            console.log(
              'WebSocketServer error: error sending CallResponseDTO to WS connection',
              response,
              e,
            )
          }

          return
        }
      })
    })

    this.wss.once('listening', () => {
      debug(
        `${this.options.config.displayName} listening ${this.bind}:${this.port}`,
      )

      if (onStartedCallback) {
        onStartedCallback()
      }
    })
  }

  stop = (onStoppedCallback?: () => void) => {
    this.wss?.close((err) => {
      if (err) {
        console.log('WSS error onclose:', err)
      }
      if (onStoppedCallback) onStoppedCallback()
    })

    for (const ws of this.wss?.clients ?? []) {
      ws.terminate()
      ws.close()
    }
  }

  private handleIncomingRequest = async (
    request: CallRequest,
  ): Promise<CallResponse> => {
    try {
      debug('sending request to requestHandler')

      const response: CallResponse = await this.requestHandler!(
        request as CallRequest,
      )

      return response
    } catch (e: any) {
      if (e instanceof CallResponse) {
        debug('handleIncomingRequest catching a throw CallResponse')

        return e as CallResponse
      }

      console.log(
        'WebSocketServer error: there was an error handling request:',
        request,
        e,
      )

      return new CallResponse(
        {
          code: 500,
          message: 'There was a problem calling the method',
          success: false,
        },
        request,
      )
    }
  }
}
