import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Encryption for the credentials this app holds on somebody else's behalf.
 *
 * A calendar refresh token is not like a password hash. It is a live key to a
 * person's work calendar — every meeting, every attendee, often for a whole
 * practice — and it stays valid for months. Stored in plain text, one leaked
 * database backup hands all of that to whoever finds it. So it goes in
 * encrypted, and the key lives outside the database in the environment.
 *
 * AES-256-GCM: authenticated, so a token that has been tampered with fails to
 * decrypt rather than being returned subtly wrong.
 */

const VERSION = 'v1'

export class MissingKeyError extends Error {
  constructor() {
    super('ENCRYPTION_KEY is not set, so connected accounts cannot be stored.')
    this.name = 'MissingKeyError'
  }
}

/**
 * The key, as 32 bytes.
 *
 * Accepts base64 or hex so whatever `openssl rand` produced works. Read on
 * every call rather than cached at import: a module read at build time would
 * capture the absence of the variable and never notice it arriving.
 */
function key(): Buffer {
  const raw = process.env.ENCRYPTION_KEY?.trim()
  if (!raw) throw new MissingKeyError()

  const buf = /^[0-9a-f]{64}$/i.test(raw)
    ? Buffer.from(raw, 'hex')
    : Buffer.from(raw, 'base64')

  if (buf.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY must be 32 bytes (got ${buf.length}). Generate one with: openssl rand -base64 32`,
    )
  }
  return buf
}

/** True when this deployment can hold connected accounts at all. */
export function canStoreSecrets(): boolean {
  try {
    key()
    return true
  } catch {
    return false
  }
}

/** `v1.<iv>.<tag>.<ciphertext>`, each part base64. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join('.')
}

export function decryptSecret(blob: string): string {
  const parts = blob.split('.')
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Stored credential is not in a format this version understands.')
  }
  const [, iv, tag, ciphertext] = parts
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}

/**
 * Compare two secrets without leaking which byte differed through timing.
 * Used for the value a provider echoes back on a push notification.
 */
export function secretsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  // timingSafeEqual throws on a length mismatch, which is itself a leak of the
  // length — but the length of a random token we generated is not a secret.
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}
