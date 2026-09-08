/**
 * Mint a session for an existing account, for local smoke-testing.
 * Usage: npx tsx scripts/dev-session.ts demo@pedr.local
 */
import { createHash, randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db, schema, sqlClient } from '../src/lib/db/client'

async function main() {
  const email = process.argv[2] ?? 'demo@pedr.local'
  const rows = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1)
  if (!rows[0]) throw new Error(`No account for ${email}. Run: npm run seed`)

  const token = randomBytes(32).toString('base64url')
  await db.insert(schema.sessions).values({
    id: createHash('sha256').update(token).digest('hex'),
    userId: rows[0].id,
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    createdAt: new Date().toISOString(),
  })
  console.log(token)
}

main().then(
  () => { sqlClient.close(); process.exit(0) },
  (error) => { console.error(String(error)); process.exit(1) },
)
