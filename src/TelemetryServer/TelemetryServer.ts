import { EventBus } from '../EventBus/EventBus'
import { deepFreeze } from '../utils/deep-freeze'
import { TelemetryPersistenceManager } from '../TelemetryPersistence/TelemetryPersistenceManager'
import { HttpServer } from './HttpServer'

export interface TelemetryServerConfig {
  adapter: {
    mongoURI: string
  }

  debug?: boolean

  server: {
    bind?: string
    port: number
    staticFilesPath?: string
  }
}

export class TelemetryServer {
  readonly eventBus: EventBus = new EventBus()

  private config: TelemetryServerConfig
  private telemetryHttpServer?: HttpServer
  private telemetryPersistenceManager: TelemetryPersistenceManager

  constructor(config: TelemetryServerConfig) {
    this.config = deepFreeze<TelemetryServerConfig>(config)

    this.telemetryPersistenceManager = new TelemetryPersistenceManager({
      mongoURI: config.adapter.mongoURI,
    })

    this.telemetryHttpServer = new HttpServer({
      config: config,
      telemetryPersistenceManager: this.telemetryPersistenceManager,
    })
  }

  start = async () => {
    this?.telemetryHttpServer?.start()
  }

  stop = () => {
    this.telemetryPersistenceManager.disconnect()
    this?.telemetryHttpServer?.stop()
  }
}
