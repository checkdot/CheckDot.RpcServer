import { CallRequest } from '../CallRequest'
import { CallResponse } from '../CallResponse'

export const RPCEventTopics = {
  handler_call_success: 'handler_call_success',
  handler_error: 'handler_error',
  rpc_server_error: 'rpc_server_error',
}

export function makeHandlerCallSuccessPayload(payload: {
  request: CallRequest
  response: CallResponse
}) {
  return payload
}

export function makeHandlerErrorPayload(payload: {
  error: Error
  request: CallRequest
  response?: CallResponse
}) {
  return payload
}

export function makeRPCServerErrorPayload(payload: {
  error: Error
  request: CallRequest
}) {
  return payload
}
