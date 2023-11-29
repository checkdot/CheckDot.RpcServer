import amqp, { AmqpConnectionManager } from 'amqp-connection-manager'
import Debug from 'debug'
import { IMessageBroker } from '../MessageBroker'
import {
  CallRequest,
  ICallRequestDescription,
} from '../../../../../../CallRequest'
import { CallResponse } from '../../../../../../CallResponse'
import { RPCServerConfig } from '../../../../../RPCServer'
import { EventBus } from '../../../../../../EventBus/EventBus'
import { Handler } from '../../../../../../Handler'
import { RabbitRpc } from './intrinsic/RabbitRpc'

const debug = Debug('rpc:RabbitManager')
const error = (...args: any[]) => console.log('RabbitManager Err:', ...args)

export interface IRabbitManagerOptions {
  config: RPCServerConfig
  eventBus: EventBus
  requestHandler: Handler
}

export class RabbitManager implements IMessageBroker {
  private connected: boolean = false
  private connection: AmqpConnectionManager
  private rpc: RabbitRpc
  private uniqueQueueName: string

  constructor(readonly options: IRabbitManagerOptions) {
    options.requestHandler
    this.uniqueQueueName = `${options.config.displayName}-${options.config.ephemeralId}`

    if (!options.config?.messageBroker?.amqpURI) {
      throw new Error('amqpURI is required')
    }

    this.connection = amqp.connect([options.config.messageBroker.amqpURI], {
      // connectionOptions: { 
      //   credentials: {
      //     mechanism: '',
      //     username: '',
      //     password: '',
      //     response: () => { return Buffer.from([]); }
      //   }
      // },
      heartbeatIntervalInSeconds: 5,
    })

    this.connection.on('connect', ({ url }) => {
      this.connected = true

      debug('rabbit connected to: ', url)
    })

    this.connection.on('disconnect', ({ err }) => {
      if (this.connected) {
        error('disconnected from rabbit broker')
      } else {
        error('failed to connect to rabbit broker')
      }
    })

    this.rpc = new RabbitRpc({
      config: options.config,
      connection: this.connection,
      eventBus: options.eventBus,
      requestHandler: options.requestHandler,
    })
  }

  sendRequestForResponse = (request: CallRequest): Promise<CallResponse> => {
    return this.rpc.sendRequestForResponse(request)
  }

  shutdown = async () => {
    // cannot restart once this has been called
    try {
      await this.rpc.shutdown()
      await this.connection.close()
    } finally {
    }
  }

  subscribeToHandleRequest = (
    request: ICallRequestDescription,
  ): Promise<void> => {
    return this.rpc.subscribeToHandleRequest(request)
  }
}
