import { Handler } from '../../Handler'

export const DEFAULT_BIND = '127.0.0.1'

export interface Server {
  name: string

  setIncomingRequestHandler(arg1: Handler): void

  start(): void

  stop(): void
}
