import { migrate, sqlClient } from '../src/lib/db/client'

async function main() {
  await migrate()
  const tables = await sqlClient.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  )
  console.log(`Database ready at ${process.env.DATABASE_URL ?? 'file:./data/pedr.db'}`)
  console.log(`Tables: ${tables.rows.map((r) => r.name).join(', ')}`)
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error('Migration failed:', error)
    process.exit(1)
  },
)
