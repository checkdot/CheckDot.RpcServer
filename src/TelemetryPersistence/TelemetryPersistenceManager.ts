import { uniqBy } from 'lodash'
import { ITelemetryHeartbeat } from '../Telemetry'
import {
  HeartbeatModel,
  MethodDescriptionModel,
  RPCStatisticsData,
  RPCStatisticsModel,
} from './intrinsic/MongoDb/Models'
import { MongoManager } from './intrinsic/MongoDb/MongoManager'

export class TelemetryPersistenceManager {
  private mongoManager: MongoManager

  constructor(adaptorConfig: { mongoURI: string }) {
    this.mongoManager = new MongoManager(adaptorConfig.mongoURI)
    this.mongoManager.setupMongoConnection()
  }

  disconnect = () => {
    this.mongoManager.tearDownConnection()
  }

  getHeartbeats = async (): Promise<any> => {
    return HeartbeatModel.find({}, null, { limit: 500 })
      .lean()
      .exec()
      .then((docs) => {
        return uniqBy(docs, 'ephemeralId')
      })
  }

  getMethodDocs = async (): Promise<any> => {
    return MethodDescriptionModel.find({}, null, { limit: 5000 })
      .lean()
      .exec()
  }

  saveHeartbeat = async (telemetryHeartbeat: ITelemetryHeartbeat) => {
    const doc = new HeartbeatModel(telemetryHeartbeat)

    try {
      await doc.save()
    } catch (err) {
      return console.error(
        'TelemetryPersistenceManager#saveHeartbeat error:',
        err,
      )
    }
  }

  saveHandlersRegistrationInfo = async (
    methodDescriptions: any[],
  ) => {
    if (!methodDescriptions.length) return

    let waitCount = 0

    while (!this.mongoManager.connected) {
      if (waitCount > 30) {
        throw Error('MongoManager has not connected to mongoDB')
      }

      waitCount++
      await new Promise((r) => setTimeout(r, 100))
    }

    try {
      const serverDisplayName = methodDescriptions[0].serverDisplayName

      await MethodDescriptionModel.deleteMany({ serverDisplayName })

      await MethodDescriptionModel.insertMany(methodDescriptions)
    } catch (err) {
      console.error(
        'TelemetryPersistenceManager#saveHandlerRegistrationInfo error:',
        err,
      )
    }
  }

  saveRPCStatistics = async (rpcStatistics: RPCStatisticsData[]) => {
    if (!rpcStatistics.length) return

    await RPCStatisticsModel.insertMany(
      rpcStatistics.map(
        ({
          date,
          totalCallTime,
          version,
          scope,
          method,
          serverDisplayName,
        }) => ({
          date,
          metadata: {
            serverDisplayName,
            scope,
            method,
            version,
          },
          totalCallTime,
        }),
      ),
    ).catch((err) => {
      console.error('TelemetryPersistenceManager#saveRPCStatistics error:', err)
    })
  }
}
