import ObjectId from 'bson-objectid'
import { RPCClientIdentity } from './RPCClientIdentity'

export const DEFAULT_REQUEST_SCOPE = 'global'
export const DEFAULT_REQUEST_VERSION = '1'

export interface ICallRequestDescription {
  internal?: boolean
  method: string
  scope: string
  version: string
}

export interface ICallRequestDTO<Args = unknown> {
  args?: Args
  params?: Args
  correlationId?: any
  identity?: {
    authorization?: string
    deviceName?: string
    metadata?: { [key: string]: any }
  },
  id?: string;
  method?: string
  scope?: string
  version?: string
  jsonrpc?: string
}

export interface CallRequestTrace {
  [key: string]: any
  // where the request came from, ie: "Http Gateway", "scope::method::version", etc.
  caller: string
  id: string
  // if this request is internal or not, a request that entered through a gateway is not internal
  internal?: boolean
  // when this request comes from a gateway, the IServer gateway impl should add the client's IP address
  ipAddress?: string
}

export interface ICallRequest<Args = any> {
  args?: Args
  correlationId?: any
  identity?: RPCClientIdentity
  method: string
  scope?: string
  version?: string
  trace: CallRequestTrace
}

export class CallRequest<Args = any> implements ICallRequest {
  static fromCallRequestDTO = (
    callRequestDTO: ICallRequestDTO,
    details: {
      trace: { caller: string; internal?: boolean; ipAddress?: string }
    },
  ): CallRequest => {
    if (!callRequestDTO.method) {
      throw new Error('method is required')
    } else if (!details?.trace?.caller) {
      throw new Error('trace.caller is required')
    }

    return new CallRequest({
      args: callRequestDTO.args ?? callRequestDTO.params,
      correlationId: callRequestDTO.correlationId,
      identity: { id: callRequestDTO.id, ... callRequestDTO.identity },
      method: callRequestDTO.method,
      scope: callRequestDTO.scope ?? 'global',
      version: callRequestDTO.version ?? callRequestDTO.jsonrpc ?? undefined,
      trace: {
        caller: details.trace.caller,
        id: callRequestDTO.correlationId || new ObjectId().toString(),
        internal: !!details.trace.internal,
        ipAddress: details.trace.ipAddress,
      },
    })
  }

  static EMPTY: CallRequest = new CallRequest({
    method: 'empty',
    trace: {
      caller: 'empty',
      id: '0',
    },
  })

  /**
   * Check if an object is a valid call request
   * @param obj
   */
  static isCallRequest(obj: any) {
    if (typeof obj === 'object') {
      return (
        obj.hasOwnProperty('method') &&
        obj.hasOwnProperty('scope') &&
        obj.hasOwnProperty('version') &&
        obj.hasOwnProperty('trace')
      )
    }

    return false
  }

  static toCallRequestDescription = (
    request: CallRequest,
  ): ICallRequestDescription => {
    return {
      method: request.method,
      scope: request.scope || DEFAULT_REQUEST_SCOPE,
      version: request.version || DEFAULT_REQUEST_VERSION,
    }
  }

  constructor(request: ICallRequest) {
    this.args = request.args
    this.correlationId = request.correlationId
    this.identity = request.identity
    this.method = request.method
    this.scope = request.scope || DEFAULT_REQUEST_SCOPE
    this.version = request.version || DEFAULT_REQUEST_VERSION
    this.trace = request.trace
  }

  args?: Args
  correlationId?: any
  identity?: {
    authorization?: string
    deviceName?: string
    metadata?: { [key: string]: any }
    id?: string
  };
  method: string
  scope?: string
  version?: string
  trace: CallRequestTrace
}
