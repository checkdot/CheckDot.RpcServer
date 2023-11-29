import { HandlerRegistrationInfo } from './Handler'

export interface ITelemetryHeartbeat {
  hostName: string
  ephemeralId: string
  gatewayHttpServer: boolean
  gatewayWebSocketServer: boolean
  displayName: string
  startTime: string
}

export interface ITelemetryHandlersRegistration extends ITelemetryHeartbeat {
  handlersRegistration: Array<HandlerRegistrationInfo>
}

export interface ITelemetryStatistics extends ITelemetryHeartbeat {
  /**
   * We need to track:
   *
   * - incoming/outgoing HTTP/WS gateway calls
   * - MessageBroker incoming/outgoing calls/responses, connections, etc.
   * - Handler execution times
   * - Errors
   * - host cpu/memory usage
   */
  callRequestCount: number
  callRequestErrorCount: number
  callResponseCount: number
  callResponseErrorCount: number
}

export enum ETelemetryReportTypes {
  Heartbeat,
  HandlersRegistration,
  Statistics,
}
