import {
  CallRequest,
  DEFAULT_REQUEST_SCOPE,
  DEFAULT_REQUEST_VERSION,
  ICallRequestDescription,
} from '../../CallRequest'
import { HandlerRegistrationInfo } from '../../Handler'
import { RPCServerConfig } from '../RPCServer'
import { EventBus } from '../../EventBus/EventBus'
import { ITelemetryHeartbeat } from '../../Telemetry'
import os from 'os'
import { TelemetryPersistenceManager } from '../../TelemetryPersistence/TelemetryPersistenceManager'
import Timeout = NodeJS.Timeout
import { RPCEventTopics } from '../Events'
import { RPCStatisticsData } from '../../TelemetryPersistence/intrinsic/MongoDb/Models'

interface ITelemetryInfoManagerOptions {
  config: RPCServerConfig
  eventBus: EventBus
}

export class TelemetryInfoManager {
  private heartbeatData: ITelemetryHeartbeat = {
    hostName: os.hostname(),
    ephemeralId: '',
    gatewayHttpServer: false,
    gatewayWebSocketServer: false,
    displayName: '',
    startTime: '',
  }
  private heartbeatInterval?: Timeout

  private registeredHandlers: HandlerRegistrationInfo[] = []

  private rpcStatisticsQueue: RPCStatisticsData[] = []
  private rpcStatisticsQueueInterval?: Timeout

  private telemetryPersistenceManager: TelemetryPersistenceManager

  constructor(readonly options: ITelemetryInfoManagerOptions) {
    if (!options.config.telemetry?.adapter) {
      throw new Error('config.telemetry.adapter must be set')
    }

    this.telemetryPersistenceManager = new TelemetryPersistenceManager(
      options.config.telemetry?.adapter,
    )

    this.heartbeatData.ephemeralId = options.config.ephemeralId
    this.heartbeatData.gatewayHttpServer = !!options.config.gatewayServer?.http
    this.heartbeatData.gatewayWebSocketServer =
      !!options.config.gatewayServer?.websocket
    this.heartbeatData.displayName = options.config.displayName
    this.heartbeatData.startTime = new Date().toISOString()
  }

  getHeartbeatData = () => this.heartbeatData

  getRegisteredHandlers = () => this.registeredHandlers

  getRPCStatistics = () => {}

  logRPCCallTime = (
    serverDisplayName: string,
    rpc: CallRequest,
    totalCallTime: number,
  ) => {
    if (this.options.config.telemetry?.saveRPCStatistics) {
      this.rpcStatisticsQueue.push({
        date: new Date(),
        totalCallTime,
        serverDisplayName,
        version: rpc.version || DEFAULT_REQUEST_VERSION,
        method: rpc.method,
        scope: rpc.scope || DEFAULT_REQUEST_SCOPE,
      })
    }
  }

  registerHandler = (request: ICallRequestDescription) => {
    this.registeredHandlers.push(request)
  }

  startTelemetryReporting = async () => {
    this.heartbeatInterval = setInterval(() => {
      this.saveHeartbeat()
    }, 30000)

    if (this.options.config.telemetry?.saveRPCStatistics) {
      // drain/save the queue every 20 sec
      this.rpcStatisticsQueueInterval = setInterval(() => {
        this.saveRPCStatistics()
      }, 1000 * 20)
    }

    await this.saveHeartbeat()

    await this.telemetryPersistenceManager.saveHandlersRegistrationInfo(
      this.registeredHandlers.map((request) => ({
        ...request,
        createdAt: new Date().toISOString(),
        serverDisplayName: this.options.config.displayName,
      })),
    )
  }

  stopTelemetryReporting = () => {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
    }

    if (this.rpcStatisticsQueueInterval) {
      clearInterval(this.rpcStatisticsQueueInterval)
    }

    this.telemetryPersistenceManager.disconnect()
  }

  private saveHeartbeat = async () => {
    return this.telemetryPersistenceManager.saveHeartbeat(this.heartbeatData)
  }

  private saveRPCStatistics = () => {
    const queueDrain = this.rpcStatisticsQueue.splice(
      0,
      this.rpcStatisticsQueue.length,
    )

    this.telemetryPersistenceManager.saveRPCStatistics(queueDrain)
  }
}
