import { RPCServer } from '../index'
import { CallResponse } from '../CallResponse'

const rpcGatewayServer = new RPCServer({
  displayName: 'example-gateway',
  ephemeralId: Math.random().toString(),
  gatewayServer: {
    http: {
      port: 3000,
    },
    websocket: {
      port: 3001,
    },
  },
  messageBroker: {
    // amqpURI: 'amqp://localhost:5672',
    amqpURI: 'amqp://76.178.162.56:5672',
  },
})

rpcGatewayServer.registerHandler(
  { method: 'login', scope: 'auth', version: '1' },
  async (request) => {
    return new CallResponse(
      {
        code: 200,
        data: {
          id: (Math.random() * 100000).toString(),
          email: 'cory@therms.io',
          user: { name: 'Cory Robinson' },
        },
        success: true,
      },
      request,
    )
  }
)

rpcGatewayServer.start()
