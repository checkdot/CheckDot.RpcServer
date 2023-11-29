import mongoose from 'mongoose'

export class MongoManager {
  private showDbConnectionLogs = false
  public connected = false

  constructor(readonly mongoURI: string) {
    this.showDbConnectionLogs = process.env.NODE_ENV !== 'test'
  }

  setupMongoConnection = async () => {
    mongoose.connect(this.mongoURI, {
      autoCreate: true,
    })

    const db = mongoose.connection

    db.on('disconnected', (info) => {
      if (this.showDbConnectionLogs) {
        console.log('MongoManager disconnected:', info)
      }
      this.connected = false
    })

    db.on('error', (err) => {
      console.error('MongoManager connection error:', err)
      this.connected = false
    })

    db.once('connected', () => {
      if (this.showDbConnectionLogs) {
        console.log('MongoManager connected:')
      }
      this.connected = true
    })
  }

  tearDownConnection = () => {
    mongoose.disconnect()
  }
}
