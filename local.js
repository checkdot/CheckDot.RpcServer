const _ = require('lodash')
const mongoose = require('mongoose')

mongoose.connect(
  'mongodb+srv://root:rpctelemetry21@cluster0.6vrvk.mongodb.net/rpc-telemetry-dev?retryWrites=true&w=majority',
  {
      useCreateIndexes: true,
    useNewUrlParser: true,
    useUnifiedTopology: true,
  },
)

const db = mongoose.connection
const HM = mongoose.model(
  'Heartbeat',
  new mongoose.Schema({
    // these documents will expire after 1min
    createdAt: { type: Date, expires: 60 },
    hostName: String,
    ephemeralId: String,
    gatewayHttpServer: Boolean,
    gatewayWebSocketServer: Boolean,
    displayName: String,
    startTime: String,
  }),
)

setTimeout(() => {
  HM.find({}, null, { limit: 5 })
    .lean()
    .exec()
    .then((docs) => {
      console.log('docs', docs)
      return docs.map((docs) => _.uniqBy(docs, 'ephemeralId'))
    })
}, 5000)
