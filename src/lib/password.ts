import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

/**
 * Password hashing, kept separate from the session code so it can be tested
 * without a request context.
 *
 * scrypt from the standard library: no dependency, memory-hard, and the
 * parameters are the Node defaults, which are chosen to be sane rather than
 * fast.
 */

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>

const KEYLEN = 64

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const derived = await scrypt(password, salt, KEYLEN)
  return `scrypt$${salt}$${derived.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const [, salt, expected] = parts
  if (!/^[0-9a-f]+$/i.test(salt) || !/^[0-9a-f]+$/i.test(expected)) return false

  const derived = await scrypt(password, salt, KEYLEN)
  const expectedBuf = Buffer.from(expected, 'hex')
  // Length is not secret, and timingSafeEqual throws on a mismatch.
  if (expectedBuf.length !== derived.length) return false
  return timingSafeEqual(derived, expectedBuf)
}

/**
 * Compared against when no account exists, so a failed login does the same
 * work as a successful one and the timing does not say which addresses are
 * registered.
 */
export const DUMMY_HASH = `scrypt$${'0'.repeat(32)}$${'0'.repeat(KEYLEN * 2)}`

export function validatePassword(password: string): string | null {
  if (password.length < 10) return 'Use at least 10 characters.'
  if (password.length > 200) return 'That is too long.'
  // Nothing more. Length is what matters, and composition rules push people
  // toward Password1! which is worse than a long phrase they will remember.
  return null
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function isEmail(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
}
