import Debug from 'debug'
import { ConfirmChannel } from 'amqplib'
import { AmqpConnectionManager, ChannelWrapper } from 'amqp-connection-manager'
import {
  PromiseTimeoutError,
  PromiseWrapper,
} from '../../../../../../../utils/PromiseWrapper'
import { CallResponse } from '../../../../../../../CallResponse'
import { Handler } from '../../../../../../../Handler'
import { RPCServerConfig } from '../../../../../../RPCServer'
import ObjectId from 'bson-objectid'
import {
  CallRequest,
  DEFAULT_REQUEST_SCOPE,
  ICallRequestDescription,
} from '../../../../../../../CallRequest'
import { makeHandlerRequestKey } from '../../../../utils/make-handler-request-key'
import { ConsumeMessage } from 'amqplib/properties'
import { EventBus } from '../../../../../../../EventBus/EventBus'
import { RPCEventTopics } from '../../../../../../Events'

const RPC_GLOBAL_EXCHANGE_NAME = 'rpc-global' // for requests that have no "scope"
const RPC_SCOPED_EXCHANGE_NAME = 'rpc-scoped' // for requests that have a "scope"

interface RabbitRpcOptions {
  config: RPCServerConfig
  connection: AmqpConnectionManager
  eventBus: EventBus
  requestHandler: Handler
}

const debug = Debug('rpc:RabbitRpc')

enum QueueMessageTypes {
  Request = 'request',
  Response = 'response',
}

export class RabbitRpc {
  private channelWrapper: ChannelWrapper
  private eventBus: EventBus
  private pendingPromisesForResponse: {
    [requestTraceId: string]: PromiseWrapper<CallResponse, CallResponse>
  } = {}
  private requestHandler: Handler
  private uniqueQueueName: string

  constructor(readonly options: RabbitRpcOptions) {
    this.eventBus = options.eventBus

    this.uniqueQueueName = `${
      options.config.displayName
    }-rpc-${new ObjectId().toString()}`

    this.requestHandler = options.requestHandler

    this.channelWrapper = options.connection.createChannel({
      json: true,
      setup: (channel: ConfirmChannel) => {
        // @ts-ignore
        channel.addListener('return', this.onReturnedQueueMsg)

        return Promise.all([
          channel.assertExchange(RPC_GLOBAL_EXCHANGE_NAME, 'direct'),
          channel.assertExchange(RPC_SCOPED_EXCHANGE_NAME, 'direct'),
          channel.assertQueue(this.uniqueQueueName, {
            autoDelete: true,
            durable: false,
            // deadLetterExchange?: string; // todo
            // deadLetterRoutingKey?: string;
            // maxPriority?: number; // todo
          }),
          channel.consume(this.uniqueQueueName, this.onMsgReceivedFromQueue, {
            noAck: true,
          }),
        ])
      },
    })
  }

  sendRequestForResponse = async (
    request: CallRequest,
  ): Promise<CallResponse> => {
    debug('sendRequestForResponse()')

    // await this.channelWrapper.waitForConnect()

    const promiseWrapper = new PromiseWrapper<CallResponse, CallResponse>()

    this.pendingPromisesForResponse[request.trace.id] = promiseWrapper

    const exchange =
      request.scope === DEFAULT_REQUEST_SCOPE
        ? RPC_GLOBAL_EXCHANGE_NAME
        : RPC_SCOPED_EXCHANGE_NAME

    await this.channelWrapper.publish(
      exchange,
      this.makeExchangeRoutingKey(
        CallRequest.toCallRequestDescription(request),
      ),
      this.makeQueueRPCObject({ request }),
      {
        appId: this.options.config.displayName,
        correlationId: request?.trace?.id,
        mandatory: true, // rabbit will return if cannot be routed, this.handleReturnedQueueMsg
        replyTo: this.uniqueQueueName,
        type: QueueMessageTypes.Request,
      },
    )

    try {
      return await promiseWrapper.promise
    } catch (e: any) {
      let message = ''

      if (e instanceof PromiseTimeoutError) {
        message = 'no response received (timed out)'
      } else {
        message = 'there was an error processing RPC'
      }

      return new CallResponse(
        {
          code: 500,
          message,
          success: false,
        },
        request,
      )
    }
  }

  shutdown = () => this.channelWrapper.close()

  subscribeToHandleRequest = async (request: ICallRequestDescription) => {
    debug('subscribeToHandleRequest', request)

    if (!this.channelWrapper) {
      throw new Error(
        'cannot subscribe request handler because rabbitmq was not initialized properly',
      )
    }

    this.channelWrapper?.addSetup(async (channel: ConfirmChannel) => {
      const exchange =
        request.scope === DEFAULT_REQUEST_SCOPE
          ? RPC_GLOBAL_EXCHANGE_NAME
          : RPC_SCOPED_EXCHANGE_NAME

      await channel.bindQueue(
        this.uniqueQueueName,
        exchange,
        this.makeExchangeRoutingKey(request),
      )
    })
  }

  private error = (...args: any[]) => console.log('RabbitRpc ERROR', ...args)

  private handleReturnedQueueMsg = async (msg: ConsumeMessage) => {
    debug('handleReturnedQueueMsg()')

    const { request } = this.parseQueueMsgContent(msg)

    if (!request) {
      this.error('rcvd returned queue msg and cannot handle', msg)

      return
    }

    if (this.pendingPromisesForResponse[request.trace.id]) {
      this.pendingPromisesForResponse[request.trace.id].resolve(
        new CallResponse(
          {
            code: 501,
            message: 'no registered handlers for RPC',
            success: false,
          },
          request,
        ),
      )
    } else {
      debug(
        'a queue message was returned but no pending requests found',
        request,
        msg,
      )
    }
  }

  private handleRequestFromQueue = async (msg: ConsumeMessage) => {
    debug('handleRequestFromQueue()')

    const { properties } = msg

    const { request } = this.parseQueueMsgContent(msg)

    if (!request) {
      this.error('rcvd queue msg that is not a valid RPC request', msg)

      return
    }

    let response

    try {
      response = await this.requestHandler(request)

      if (!response) {
        throw new Error('request handler provided no response')
      }
    } catch (e: any) {
      this.error('error handling request from the queue', e)
      this.error('   request: ', request)
    }

    try {
      if (response) {
        await this.sendHandledResponseToQueue(
          properties.replyTo,
          response,
          request,
        )
      }
    } catch (e: any) {
      this.error('error sending response to the queue', e)
      this.error('   response: ', response)
    }
  }

  private handleResponseFromQueue = async (msg: ConsumeMessage) => {
    debug('handleResponseFromQueue()')

    const { properties } = msg

    const { response, request } = this.parseQueueMsgContent(msg)

    if (!request || !response) {
      this.error('rcvd queue msg that is not a valid RPC response', msg)

      return
    }

    if (this.pendingPromisesForResponse[response.trace.id]) {
      this.pendingPromisesForResponse[response.trace.id].resolve(response)
    } else {
      this.error(
        'received queue msg response with no pending request found locally',
        request,
        response,
      )
    }
  }

  private makeExchangeRoutingKey = (request: ICallRequestDescription) =>
    makeHandlerRequestKey(request)

  /**
   * This method creates the structure for objects that we send over the queue
   * @param request {CallRequest}
   * @param response {CallResponse}
   */
  private makeQueueRPCObject = ({
    request,
    response,
  }: {
    request: CallRequest
    response?: CallResponse
  }) => ({
    request,
    response,
  })

  private onReturnedQueueMsg = (msg: ConsumeMessage) => {
    debug('onReturnedQueueMsg()')

    this.handleReturnedQueueMsg(msg)
  }

  private onMsgReceivedFromQueue = async (msg: ConsumeMessage | null) => {
    debug('handleMsgFromQueue() message', msg)

    if (!msg) {
      debug('queue consumer received empty msg')

      return
    }

    switch (msg.properties.type) {
      case QueueMessageTypes.Response:
        this.handleResponseFromQueue(msg)
        break
      case QueueMessageTypes.Request:
        this.handleRequestFromQueue(msg)
        break
      default:
        this.error(
          'rcvd rabbit queue msg with unrecognized "type" property: ',
          msg,
        )
    }
  }

  private parseQueueMsgContent = (
    msg: ConsumeMessage,
  ): { response?: CallResponse; request?: CallRequest } => {
    try {
      let json

      json = JSON.parse(msg.content.toString())

      if (!json.request) {
        debug('parseQueueMsg() json has no "request" prop', json)
        return {}
      }

      const response = json.response
        ? new CallResponse(json.response, json.request)
        : undefined
      const request = new CallRequest(json.request)

      return {
        response,
        request,
      }
    } catch (e: any) {
      this.error('unable to parse queue msg content', e, msg)

      return {}
    }
  }

  private sendHandledResponseToQueue = async (
    queueName: string,
    response: CallResponse,
    request: CallRequest,
  ) => {
    debug(
      'sendHandledResponseToQueue() sending response for a request',
      request,
    )

    await this.channelWrapper!.sendToQueue(
      queueName,
      this.makeQueueRPCObject({ request, response }),
      {
        appId: this.options.config.displayName,
        correlationId: request?.trace?.id,
        type: QueueMessageTypes.Response,
      },
    )
  }
}
