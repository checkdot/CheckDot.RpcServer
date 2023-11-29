import { RPCServer } from '../index'
import { CallResponse } from '../CallResponse'

const rpcHandlerServer = new RPCServer({
  displayName: 'example-handler',
  ephemeralId: Math.random().toString(),
  messageBroker: {
    // amqpURI: 'amqp://localhost:5672',
    amqpURI: 'amqp://76.178.162.56:5672',
  },
})

rpcHandlerServer.registerHandler(
    { method: 'login', scope: 'auth', version: '1' },
    async (request) => {
        return new CallResponse(
            {
                code: 200,
                data: { id: (Math.random() * 100000).toString(), name: 'Tom C' },
                success: true,
            },
            request,
        )
    },
)

rpcHandlerServer.registerHandler(
  { method: 'get-users', scope: 'users', version: '1' },
  async (request) => {
    if (!request.identity?.authorization) {
      return new CallResponse(
        {
          code: 403,
          message: 'you are not authorized',
          success: false,
        },
        request,
      )
    }

    return new CallResponse(
      {
        code: 200,
        data: [
          { id: (Math.random() * 100000).toString(), name: 'Tom C' },
          { id: (Math.random() * 100000).toString(), name: 'Zoo Randall' },
          { id: (Math.random() * 100000).toString(), name: 'Cory Robinson' },
        ],
        success: true,
      },
      request,
    )
  },
)

rpcHandlerServer.registerHandler(
  { method: 'get-user', scope: 'users', version: '1' },
  async (request) => {
    if (!request.identity?.authorization) {
      return new CallResponse(
        {
          code: 403,
          message: 'you are not authorized',
          success: false,
        },
        request,
      )
    }

    return new CallResponse(
      {
        code: 200,
        data: { id: (Math.random() * 100000).toString(), name: 'Tom C' },
        success: true,
      },
      request,
    )
  },
)

rpcHandlerServer.start()
