/**
 * RPCClientIdentity is the client's "identity", ie: User/auth/device/etc.
 */
export interface RPCClientIdentity {
  authorization?: string
  deviceName?: string
  metadata?: { [key: string]: any },
  id?: string
}

export function isIdentityValid(identity: RPCClientIdentity) {
  if (!identity) return false

  if (identity.authorization && typeof identity.authorization !== 'string')
    return false
  if (identity.deviceName && typeof identity.deviceName !== 'string')
    return false
  if (identity.metadata && typeof identity.metadata !== 'object') return false

  return true
}
