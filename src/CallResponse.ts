import { CallRequest } from './CallRequest'

export interface ICallResponseDTO<Data = any> {
  code: number
  correlationId?: any
  data?: Data
  message?: string
  success: boolean
}

export interface ICallResponse<Data = any> {
  code: number
  correlationId?: any
  data?: Data
  message?: string
  success: boolean
}

export class CallResponse<Data = any> {
  static EMPTY: CallResponse = new CallResponse(
    {
      code: 500,
      message: 'empty',
      success: false,
    },
    CallRequest.EMPTY,
  )

  /**
   * Check if an object is a valid call response
   * @param obj
   */
  static isCallResponse(obj: any) {
    if (obj instanceof CallResponse || typeof obj === 'object') {
      return (
        obj.hasOwnProperty('code') &&
        obj.hasOwnProperty('success') &&
        obj.hasOwnProperty('trace')
      )
    }

    return false
  }

  /**
   * Check if an object is a valid call response DTO
   * @param obj
   */
  static isCallResponseDTO(obj: any) {
    if (typeof obj === 'object') {
      return obj.hasOwnProperty('code') && obj.hasOwnProperty('success')
    }


    return false
  }

  static toCallResponseDTO = (response: CallResponse): any => {
    return response.data ?? {};
    // return {
    //   code: response.code,
    //   correlationId: response.correlationId,
    //   data: response.data,
    //   message: response.message,
    //   success: response.success,
    // }
  }

  constructor(response: ICallResponse<Data>, request: CallRequest) {
    this.code = response.code
    this.correlationId = request.correlationId || response.correlationId
    this.data = response.data
    this.message = response.message
    this.success = response.success
    this.trace = {
      id: request.trace.id,
    }
  }

  code: number
  correlationId?: any
  data?: Data
  message?: string
  success: boolean

  trace: {
    id: string
  }
}
