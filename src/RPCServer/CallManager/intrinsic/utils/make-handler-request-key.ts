import {
  ICallRequestDescription,
  ICallRequestDTO,
} from '../../../../CallRequest'

export function makeHandlerRequestKey(
  request: ICallRequestDescription | ICallRequestDTO,
): string {
  return `${request.scope}::${request.method}::${request.version}`
}
