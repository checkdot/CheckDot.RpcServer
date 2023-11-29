import Koa from 'koa'
import cors from '@koa/cors'
import logger from 'koa-logger'
import koaStatic from 'koa-static'
// @ts-ignore
import koaSendFile from 'koa-sendfile'
import path from 'path'
import { Server as NodeHttpServer } from 'http'
import { TelemetryServerConfig } from './TelemetryServer'
import { TelemetryPersistenceManager } from '../TelemetryPersistence/TelemetryPersistenceManager'

interface IHttpServerOptions {
  config: TelemetryServerConfig
  telemetryPersistenceManager: TelemetryPersistenceManager
}

const DEFAULT_BIND = '127.0.0.1'

export class HttpServer {
  private koaApp: Koa
  private koaAppListener?: NodeHttpServer
  private staticFilesPath?: string
  private telemetryPersistenceManager: TelemetryPersistenceManager

  constructor(readonly options: IHttpServerOptions) {
    this.koaApp = new Koa()
    this.koaApp.use(cors())
    this.koaApp.use(logger())

    this.staticFilesPath = this.options.config?.server?.staticFilesPath
    this.telemetryPersistenceManager = options.telemetryPersistenceManager
  }

  start = (onStartedCallback?: () => void) => {
    if (this.koaAppListener) return

    this.configureRoutes()

    const host = this.options.config.server?.bind || DEFAULT_BIND
    const port = this.options.config?.server.port

    this.koaAppListener = this.koaApp.listen(
      {
        host,
        port,
      },
      () => {
        this.log(`Telemetry HTTP server listening ${host}:${port}`)

        if (onStartedCallback) {
          onStartedCallback()
        }
      },
    )
  }

  stop = (onStoppedCallback?: () => void) => {
    const host = this.options.config.server?.bind || DEFAULT_BIND
    const port = this.options.config.server.port

    this.koaAppListener?.close((err) => {
      if (err) {
        // todo: log error
        // console.log(
        //   `${this.displayName} had an error when stopping (${host}:${port})`,
        //   err,
        // );
      } else {
        this.log(`server stopped (${host}:${port})`)

        this.koaAppListener = undefined

        if (onStoppedCallback) {
          onStoppedCallback()
        }
      }
    })
  }

  private configureRoutes = () => {
    if (this.staticFilesPath) {
      this.koaApp.use(koaStatic(this.staticFilesPath))
    }

    this.koaApp.use(async (ctx, next) => {
      switch (ctx.request.path) {
        case '/docs':
          try {
            const docs = await this.telemetryPersistenceManager.getMethodDocs()
            ctx.body = docs
            ctx.status = 200
          } catch (e: any) {
            console.log('HttpServer error fetching method docs:', e)
            ctx.status = 500
          }
          break

        case '/health':
          ctx.body = 'ok'
          ctx.status = 200
          break

        case '/heartbeats':
          try {
            const docs = await this.telemetryPersistenceManager.getHeartbeats()
            ctx.body = docs
            ctx.status = 200
          } catch (e: any) {
            console.log('HttpServer error fetching heartbeats:', e)
            ctx.status = 500
          }
          break

        default:
          // default to serve the index.html file if `staticFilesPath` is set
          if (this.staticFilesPath) {
            return koaSendFile(
              ctx,
              path.join(this.staticFilesPath, 'index.html'),
            )
          } else {
            ctx.body = 'Route not recognized and no files found'
            ctx.status = 404
          }
          break
      }

      return
    })
  }

  private log = (...args: any[]) => {
    console.log(`TelemetryServer `, ...args)
  }
}
