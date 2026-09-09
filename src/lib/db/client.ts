import { createClient, type Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import * as schema from './schema'

/**
 * One database client for the process.
 *
 * `DATABASE_URL` decides everything: `file:./data/pedr.db` for local work,
 * `libsql://...` with an auth token in production. Same dialect either way.
 */

declare global {
  // eslint-disable-next-line no-var
  var __pedrDb: ReturnType<typeof build> | undefined
}

function build() {
  const url = process.env.DATABASE_URL ?? 'file:./data/pedr.db'

  // A local file database cannot create its own directory.
  if (url.startsWith('file:')) {
    const path = url.slice('file:'.length).split('?')[0]
    if (path && path !== ':memory:') {
      try {
        mkdirSync(dirname(path), { recursive: true })
      } catch {
        // Already there, or read-only. The client will report the real problem.
      }
    }
  }

  const client: Client = createClient({
    url,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  })
  return { client, db: drizzle(client, { schema }) }
}

const instance = globalThis.__pedrDb ?? build()
if (process.env.NODE_ENV !== 'production') globalThis.__pedrDb = instance

export const db = instance.db
export const sqlClient = instance.client
export { schema }

/** Create every table if it is missing. Safe to run repeatedly. */
export async function migrate(client: Client = sqlClient): Promise<void> {
  const statements = schema.DDL.split(';')
    .map((s) => s.trim())
    .filter(Boolean)

  // Columns first: a unique index in the DDL may name a column that an older
  // database does not have yet.
  for (const { table, column, definition } of schema.ADDED_COLUMNS) {
    if (await hasTable(client, table) && !(await hasColumn(client, table, column))) {
      await client.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
    }
  }

  for (const statement of statements) {
    await client.execute(statement)
  }
}

async function hasTable(client: Client, table: string): Promise<boolean> {
  const result = await client.execute({
    sql: "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?",
    args: [table],
  })
  return result.rows.length > 0
}

async function hasColumn(client: Client, table: string, column: string): Promise<boolean> {
  const result = await client.execute(`PRAGMA table_info(${table})`)
  return result.rows.some((row) => row.name === column)
}
