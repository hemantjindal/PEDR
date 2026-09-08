import { eq } from 'drizzle-orm'
import { cookies } from 'next/headers'
import {
  createHash, randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual,
} from 'node:crypto'
import { promisify } from 'node:util'
import { db, schema } from './db/client'

/**
 * Small, self-contained auth. Email and password, scrypt, a session cookie.
 *
 * No third-party identity service, because "my friends can use it" should not
 * require anyone to sign up for anything, and because the whole surface here is
 * short enough to read.
 *
 * Two details that matter:
 *  - The cookie holds a random token; the database stores only its SHA-256. A
 *    leaked database therefore does not hand over live sessions.
 *  - A failed login does the same work as a successful one, so the response
 *    time does not reveal whether an address is registered.
 */

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>

const SCRYPT_KEYLEN = 64
const SESSION_COOKIE = 'pedr_session'
const SESSION_DAYS = 30

export interface SessionUser {
  id: string
  email: string
  name: string
  teamsName: string | null
  calendarToken: string
  experienceStart: string | null
  targetExamDate: string | null
}

// ---------------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------------

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const derived = await scrypt(password, salt, SCRYPT_KEYLEN)
  return `scrypt$${salt}$${derived.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const [, salt, expected] = parts
  const derived = await scrypt(password, salt, SCRYPT_KEYLEN)
  const expectedBuf = Buffer.from(expected, 'hex')
  if (expectedBuf.length !== derived.length) return false
  return timingSafeEqual(derived, expectedBuf)
}

/** A dummy hash to compare against when the account does not exist. */
const DUMMY_HASH =
  'scrypt$0000000000000000000000000000000000000000000000000000000000000000$' +
  '0'.repeat(SCRYPT_KEYLEN * 2)

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString()
  await db.insert(schema.sessions).values({
    id: hashToken(token),
    userId,
    expiresAt,
    createdAt: new Date().toISOString(),
  })
  return token
}

export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_DAYS * 86_400,
  })
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies()
  jar.delete(SESSION_COOKIE)
}

/** The signed-in user, or null. Safe to call from any server component. */
export async function getUser(): Promise<SessionUser | null> {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (!token) return null

  const rows = await db
    .select({
      sessionId: schema.sessions.id,
      expiresAt: schema.sessions.expiresAt,
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      teamsName: schema.users.teamsName,
      calendarToken: schema.users.calendarToken,
      experienceStart: schema.users.experienceStart,
      targetExamDate: schema.users.targetExamDate,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    .where(eq(schema.sessions.id, hashToken(token)))
    .limit(1)

  const row = rows[0]
  if (!row) return null
  if (new Date(row.expiresAt).getTime() < Date.now()) {
    await db.delete(schema.sessions).where(eq(schema.sessions.id, row.sessionId))
    return null
  }

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    teamsName: row.teamsName,
    calendarToken: row.calendarToken,
    experienceStart: row.experienceStart,
    targetExamDate: row.targetExamDate,
  }
}

export class UnauthorisedError extends Error {
  constructor() {
    super('Not signed in')
    this.name = 'UnauthorisedError'
  }
}

/** The signed-in user, or throw. For route handlers. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getUser()
  if (!user) throw new UnauthorisedError()
  return user
}

export async function destroySession(): Promise<void> {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (token) {
    await db.delete(schema.sessions).where(eq(schema.sessions.id, hashToken(token)))
  }
  await clearSessionCookie()
}

// ---------------------------------------------------------------------------
// Registration and sign-in
// ---------------------------------------------------------------------------

export type AuthOutcome = { ok: true; userId: string } | { ok: false; error: string }

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function validatePassword(password: string): string | null {
  if (password.length < 10) return 'Use at least 10 characters.'
  if (password.length > 200) return 'That is too long.'
  // Nothing more. Length is what matters, and composition rules push people
  // toward Password1! which is worse than a long phrase they will remember.
  return null
}

export async function signUp(input: {
  email: string
  password: string
  name: string
}): Promise<AuthOutcome> {
  const email = normaliseEmail(input.email)
  const name = input.name.trim()

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'That email does not look right.' }
  if (!name) return { ok: false, error: 'What should we call you?' }

  const passwordProblem = validatePassword(input.password)
  if (passwordProblem) return { ok: false, error: passwordProblem }

  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1)
  if (existing.length > 0) return { ok: false, error: 'There is already an account with that email.' }

  const id = randomUUID()
  await db.insert(schema.users).values({
    id,
    email,
    name,
    passwordHash: await hashPassword(input.password),
    teamsName: name,
    calendarToken: randomBytes(18).toString('base64url'),
    experienceStart: null,
    targetExamDate: null,
    createdAt: new Date().toISOString(),
  })
  return { ok: true, userId: id }
}

export async function signIn(input: { email: string; password: string }): Promise<AuthOutcome> {
  const email = normaliseEmail(input.email)
  const rows = await db
    .select({ id: schema.users.id, passwordHash: schema.users.passwordHash })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1)

  const row = rows[0]
  // Hash against a dummy when there is no account, so the timing is the same
  // either way and does not leak which addresses are registered.
  const ok = await verifyPassword(input.password, row?.passwordHash ?? DUMMY_HASH)

  if (!row || !ok) return { ok: false, error: 'That email and password do not match.' }
  return { ok: true, userId: row.id }
}
