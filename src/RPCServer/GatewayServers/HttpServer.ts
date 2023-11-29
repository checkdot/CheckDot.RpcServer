import Http, { IncomingMessage, Server as Http1Server } from 'http'
import Koa, { Context } from 'koa'
import cors from '@koa/cors'
import koaBodyParser from 'koa-bodyparser'
import { DEFAULT_BIND, Server } from './Server'
import { Handler } from '../../Handler'
import { CallRequest, ICallRequestDTO } from '../../CallRequest'
import { CallResponse } from '../../CallResponse'
import { RPCServerConfig } from '../RPCServer'
import { EventBus } from '../../EventBus/EventBus'
import Debug from 'debug'
import { makeHandlerRequestKey } from '../CallManager/intrinsic/utils/make-handler-request-key'

const debug = Debug('rpc:HttpServer')

interface HttpServerOptions {
  config: RPCServerConfig
  eventBus: EventBus
}

export class HttpServer implements Server {
  private eventBus: EventBus
  private httpServer: Http1Server
  private koaApp: Koa
  private serverListening: boolean = false
  private requestHandler?: Handler

  constructor(readonly options: HttpServerOptions) {
    this.eventBus = options.eventBus

    this.koaApp = new Koa({ proxy: true })

    this.koaApp.use(async (ctx, next) => {
      try {
        await next()
      } catch (err) {
        console.log(
          'There was an error in the Koa app from an incoming request',
          err,
        )

        ctx.body = {
          code: 400,
          message: 'unable to parse & handle request',
          success: false,
        }
      }
    })

    this.koaApp.use(koaBodyParser())
    this.koaApp.use(cors({ maxAge: 600, origin: '*' }))

    this.httpServer = Http.createServer(this.koaApp.callback())

    this.setup()
  }

  name = 'HttpServer'

  private static parseIPAddressFromHttpReq(req: IncomingMessage): string {
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

  setIncomingRequestHandler = (requestHandler: Handler) => {
    this.requestHandler = requestHandler
  }

  start = (onStartedCallback?: () => void) => {
    if (!this.requestHandler) {
      throw new Error(`No request handler has be set`)
    }

    if (this.serverListening) {
      debug('cannot start again, already runnning')
      return
    }

    const host = this.options.config.gatewayServer?.http?.bind || DEFAULT_BIND
    const port = this.options.config.gatewayServer?.http?.port

    this.httpServer.listen(
      {
        host,
        port,
      },
      () => {
        debug(`${this.options.config.displayName} listening ${host}:${port}`)

        this.serverListening = true

        if (onStartedCallback) {
          onStartedCallback()
        }
      },
    )
  }

  stop = (onStoppedCallback?: () => void) => {
    const host = this.options.config.gatewayServer?.http?.bind || DEFAULT_BIND
    const port = this.options.config.gatewayServer?.http?.port

    this.httpServer?.close((err) => {
      if (err) {
        debug(`error when stopping (${host}:${port})`, err)
      } else {
        debug(`stopped (${host}:${port})`)

        this.serverListening = false
      }

      if (onStoppedCallback) {
        onStoppedCallback()
      }
    })
  }

  private setup = () => {
    this.koaApp.use(async (ctx: Context) => {
      debug('received request')

      if (ctx.request.path === '/health') {
        debug('returning health check status')
        ctx.body = 'ok'
        ctx.status = 200

        return
      }

      if (
        !ctx.request.body ||
        typeof ctx.request.body !== 'object' ||
        !Object.keys(ctx.request.body).length
      ) {
        debug('empty request body received', ctx.request.body)

        ctx.body = {
          code: 400,
          message: 'Empty request body received',
          success: false,
        }

        return
      }

      const requestDTO: ICallRequestDTO = ctx.request.body
      let request

      try {
        request = CallRequest.fromCallRequestDTO(requestDTO, {
          trace: {
            caller: 'HttpServer',
            ipAddress: HttpServer.parseIPAddressFromHttpReq(ctx.req),
          },
        })

        debug(`request "${makeHandlerRequestKey(request)}"`)
      } catch (e: any) {
        debug('error converting request body to CallRequest', e)

        ctx.body = {
          code: 400,
          correlationId: request?.correlationId,
          message: 'unable to parse request body as a valid CallRequest',
          success: false,
        }

        return
      }

      try {
        debug('sending request to requestHandler')

        const response: CallResponse = await this.requestHandler!(
          request as CallRequest,
        )

        debug('returning request response')

        ctx.body = CallResponse.toCallResponseDTO(response)
      } catch (e: any) {
        console.log(
          'HttpSerer error: there was an error handling request:',
          e,
          request,
        )

        ctx.body = {
          code: 500,
          correlationId: request?.correlationId,
          message: 'There was a problem calling the method',
          success: false,
        }
      }

      return
    })
  }
}
