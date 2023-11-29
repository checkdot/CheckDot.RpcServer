import { CallRequest, ICallRequestDescription } from '../../../../CallRequest'
import { CallResponse } from '../../../../CallResponse'
import { RPCServerConfig } from '../../../RPCServer'
import { EventBus } from '../../../../EventBus/EventBus'
import { IMessageBroker } from './intrinsic/MessageBroker'
import { RabbitManager } from './intrinsic/Rabbit/RabbitManager'
import { Handler } from '../../../../Handler'

interface MessageBrokerManagerOptions {
  config: RPCServerConfig
  eventBus: EventBus
  requestHandler: Handler
}

/**
 * The MessageBrokerManager is responsible for managing the messageBroker in the
 * server (rabbitmq, kafka, redis, etc.).
 */
export class MessageBrokerManager {
  private messageQueue: IMessageBroker

  constructor(readonly options: MessageBrokerManagerOptions) {
    if (!options.config.messageBroker?.amqpURI)
      throw new Error(
        'cannot be initialized without config.messageBroker.amqpURI connection info for a MessageBroker',
      )

    this.messageQueue = new RabbitManager(options)
  }

  manageRequest = async (request: CallRequest): Promise<CallResponse> => {
    return this.messageQueue.sendRequestForResponse(request)
  }

  registerHandler = async (request: ICallRequestDescription) => {
    return this.messageQueue.subscribeToHandleRequest(request)
  }
}
