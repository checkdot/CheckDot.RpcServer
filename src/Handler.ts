import { CallRequest, ICallRequestDTO } from './CallRequest'
import { CallResponse, ICallResponseDTO } from './CallResponse'

export type RPCServerHandler<Args = any, Data = any> = (
  request: CallRequest<Args>,
  call: (request: ICallRequestDTO<Args>) => Promise<ICallResponseDTO<Data>>,
) => Promise<
  | Data
  | CallResponse<Data>
  | { code: number; data?: Data; message?: string; success: boolean }
>

export type Handler<Args = any, Data = any> = (
  request: CallRequest<Args>,
) => Promise<CallResponse<Data>> | CallResponse<Data>

export type HandlerRequestValidator = (
  request: CallRequest,
) => Promise<CallResponse | undefined> | CallResponse | undefined

export interface HandlerRegistrationInfo<Args = any, Data = any> {
  // Describes the call request args (DTO)
  args?: Args
  // Describes the call response data (DTO)
  data?: Data
  description?: string
  // a description of the required identity/auth
  identity?: string[] | string
  // If internal, this request can only be called by programatically behind the network
  internal?: boolean
  method: string
  scope: string
  version: string
}
