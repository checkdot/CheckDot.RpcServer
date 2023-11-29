import mongoose, { Schema } from 'mongoose'

export const HeartbeatModel = mongoose.model(
  'Heartbeat',
  new mongoose.Schema({
    // these documents will expire after 1min
    createdAt: { default: Date.now, type: Date, expires: 60 },
    hostName: String,
    ephemeralId: String,
    gatewayHttpServer: Boolean,
    gatewayWebSocketServer: Boolean,
    displayName: String,
    startTime: String,
  }),
)

export const MethodDescriptionModel = mongoose.model(
  'MethodDescription',
  new mongoose.Schema({
    args: Schema.Types.Mixed,
    createdAt: String,
    data: Schema.Types.Mixed,
    description: String,
    identity: [String],
    internal: Boolean,
    method: { required: true, type: String },
    scope: { default: 'global', type: String },
    serverDisplayName: String,
    version: { default: '1', type: String },
  }),
)

export type RPCStatisticsData = {
  date: Date
  totalCallTime: number
  scope: string
  method: string
  version: string
  serverDisplayName: string
}

export const RPCStatisticsModel = mongoose.model(
  'RPCStatistics',
  new Schema(
    {
      date: Date,
      totalCallTime: Number,
      metadata: {
        scope: String,
        method: String,
        serverDisplayName: String,
        version: String,
      },
    },
    {
      timeseries: {
        timeField: 'date',
        metaField: 'metadata',
        granularity: 'minutes',
      },
      autoCreate: true,
      // 30 days
      expireAfterSeconds: 1000 * 60 * 60 * 24 * 31,
    },
  ),
)
