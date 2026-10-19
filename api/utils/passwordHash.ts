import crypto from 'crypto'

const PREFIX = 'scrypt$'
const KEY_LENGTH = 32

/** Stored form of the app password: `scrypt$<salt hex>$<key hex>`. */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16)
  const key = crypto.scryptSync(password, salt, KEY_LENGTH)
  return `${PREFIX}${salt.toString('hex')}$${key.toString('hex')}`
}

export function isPasswordHash(value: string): boolean {
  return value.startsWith(PREFIX)
}

export function verifyPasswordHash(password: string, stored: string): boolean {
  const [, saltHex, keyHex] = stored.split('$')
  if (!isPasswordHash(stored) || !saltHex || !keyHex) return false
  const key = Buffer.from(keyHex, 'hex')
  const candidate = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), key.length)
  return key.length === KEY_LENGTH && crypto.timingSafeEqual(candidate, key)
}
