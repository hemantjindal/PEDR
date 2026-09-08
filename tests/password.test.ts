import { describe, expect, it } from 'vitest'
import {
  DUMMY_HASH, hashPassword, isEmail, normaliseEmail, validatePassword, verifyPassword,
} from '@/lib/password'

describe('hashPassword / verifyPassword', () => {
  it('round-trips a password', async () => {
    const hash = await hashPassword('a long enough passphrase')
    expect(await verifyPassword('a long enough passphrase', hash)).toBe(true)
  })

  it('rejects the wrong password', async () => {
    const hash = await hashPassword('a long enough passphrase')
    expect(await verifyPassword('a long enough passphrasf', hash)).toBe(false)
    expect(await verifyPassword('', hash)).toBe(false)
  })

  it('salts, so the same password hashes differently every time', async () => {
    const a = await hashPassword('same password here')
    const b = await hashPassword('same password here')
    expect(a).not.toBe(b)
    expect(await verifyPassword('same password here', a)).toBe(true)
    expect(await verifyPassword('same password here', b)).toBe(true)
  })

  it('stores the algorithm, so the format can change later', async () => {
    expect(await hashPassword('x'.repeat(12))).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/)
  })

  it('refuses a malformed stored hash instead of throwing', async () => {
    for (const bad of ['', 'not-a-hash', 'scrypt$only-two-parts', 'bcrypt$aa$bb', 'scrypt$zz$zz']) {
      expect(await verifyPassword('anything at all', bad), bad).toBe(false)
    }
  })

  it('does not match anything against the dummy hash', async () => {
    expect(await verifyPassword('', DUMMY_HASH)).toBe(false)
    expect(await verifyPassword('password', DUMMY_HASH)).toBe(false)
  })

  it('handles a password of a different length to the stored key', async () => {
    const hash = await hashPassword('short one here')
    expect(await verifyPassword('a very much longer password than the original', hash)).toBe(false)
  })

  it('treats a unicode password byte-for-byte', async () => {
    const hash = await hashPassword('pässwörd with ümlauts')
    expect(await verifyPassword('pässwörd with ümlauts', hash)).toBe(true)
    expect(await verifyPassword('passwörd with ümlauts', hash)).toBe(false)
  })
})

describe('validatePassword', () => {
  it('asks for length and nothing else', () => {
    expect(validatePassword('short')).toMatch(/at least 10/)
    expect(validatePassword('exactly-10')).toBeNull()
    expect(validatePassword('correct horse battery staple')).toBeNull()
    expect(validatePassword('x'.repeat(201))).toMatch(/too long/)
  })
})

describe('email handling', () => {
  it('normalises case and whitespace so one person has one account', () => {
    expect(normaliseEmail('  Alex@Example.COM ')).toBe('alex@example.com')
  })

  it('accepts real addresses and rejects obvious nonsense', () => {
    for (const good of ['a@b.co', 'alex.smith+pedr@practice.co.uk']) {
      expect(isEmail(good), good).toBe(true)
    }
    for (const bad of ['', 'alex', 'alex@', '@example.com', 'alex@example', 'a b@c.com']) {
      expect(isEmail(bad), bad).toBe(false)
    }
  })
})
