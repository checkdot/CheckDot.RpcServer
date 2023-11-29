import {
  CallRequest,
  ICallRequestDescription,
} from '../../../../../CallRequest'
import { CallResponse } from '../../../../../CallResponse'

export interface IMessageBroker {
  sendRequestForResponse(request: CallRequest): Promise<CallResponse>

  subscribeToHandleRequest(request: ICallRequestDescription): Promise<void>
}
