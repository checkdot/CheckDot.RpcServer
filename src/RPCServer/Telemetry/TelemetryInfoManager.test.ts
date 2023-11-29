import { TelemetryInfoManager } from './TelemetryInfoManager'
import { EventBus } from '../../EventBus/EventBus'

describe('TelemetryInfoManager', () => {
  const eventBus = new EventBus()

  const rpcsServerOptions = {
    config: {
      displayName: 'test',
      ephemeralId: Math.random().toString(),
      telemetry: {
        adapter: {
          mongoURI: 'mongodb://localhost:27017/test',
        },
      },
    },
    eventBus,
  }

  // it('tracks stats', () => {
  //   const telemetryInfoManager = new TelemetryInfoManager(rpcsServerOptions)
  //
  //   eventBus.publish({
  //     topic: RPCEventTopics.handler_call_success,
  //     payload: makeHandlerCallSuccessPayload({
  //       response: CallResponse.EMPTY,
  //       request: CallRequest.EMPTY,
  //     }),
  //   })
  //
  //   eventBus.publish({
  //     topic: RPCEventTopics.handler_error,
  //     payload: makeHandlerErrorPayload({
  //       error: new Error('some error'),
  //       response: CallResponse.EMPTY,
  //       request: CallRequest.EMPTY,
  //     }),
  //   })
  //
  //   eventBus.publish({
  //     topic: RPCEventTopics.rpc_server_error,
  //     payload: makeRPCServerErrorPayload({
  //       error: new Error(''),
  //       request: CallRequest.EMPTY,
  //     }),
  //   })
  //
  //   expect(telemetryInfoManager.getStatistics().handlerErrorCount).toEqual(1)
  //   expect(telemetryInfoManager.getStatistics().handlerSuccessCount).toEqual(1)
  //   expect(telemetryInfoManager.getStatistics().rpcServerErrorCount).toEqual(1)
  // })

  it('saves method descriptions to mongo', async () => {
    const telemetryInfoManager = new TelemetryInfoManager(rpcsServerOptions)

    telemetryInfoManager.registerHandler({
      method: 'test',
      scope: 'test',
      version: '1',
    })

    try {
      telemetryInfoManager.startTelemetryReporting()
    } catch (e: any) {
      // will throw
      // todo: need to implement mongodb mock for test env
    }

    telemetryInfoManager.stopTelemetryReporting()

    await new Promise((r) => setTimeout(r, 1000))
  })
})
