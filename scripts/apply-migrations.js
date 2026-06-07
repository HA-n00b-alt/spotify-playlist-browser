#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { Client } = require('pg')
const { ROOT, loadEnvLocal } = require('./lib/env')

const MIGRATIONS_DIR = path.join(ROOT, 'migrations')
const STATE_PATH = path.join(ROOT, '.deploy', 'applied-migrations.json')

function loadState() {
  if (!fs.existsSync(STATE_PATH)) {
    return { applied: [] }
  }
  return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'))
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true })
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`)
}

function listMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return []
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()
}

function migrationChecksum(sql) {
  return crypto.createHash('sha256').update(sql).digest('hex')
}

function createClient(databaseUrl) {
  return new Client({
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false,
    },
  })
}

async function ensureSchemaMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      source TEXT NOT NULL DEFAULT 'migration_runner'
    )
  `)
}

async function loadAppliedMigrationsFromDb(client) {
  const result = await client.query(
    'SELECT filename, checksum, applied_at, source FROM schema_migrations ORDER BY filename'
  )
  return result.rows
}

async function detectExistingSchemaMarkers(client) {
  const result = await client.query(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'admin_access_requests',
          'admin_settings',
          'spotify_access_requests',
          'track_credits_cache',
          'muso_track_cache',
          'muso_album_cache'
        )
    ) AS has_markers
  `)

  return result.rows[0]?.has_markers === true
}

async function bootstrapLedgerFromLocalState(client, localState, migrationFilesByName) {
  if (!Array.isArray(localState.applied) || localState.applied.length === 0) {
    return 0
  }

  let inserted = 0
  for (const filename of localState.applied) {
    const sql = migrationFilesByName.get(filename)
    if (!sql) {
      throw new Error(`Local migration state references missing file: ${filename}`)
    }

    await client.query(
      `
        INSERT INTO schema_migrations (filename, checksum, source)
        VALUES ($1, $2, 'local_state_bootstrap')
        ON CONFLICT (filename) DO NOTHING
      `,
      [filename, migrationChecksum(sql)]
    )
    inserted += 1
  }

  return inserted
}

async function runMigration(client, filename, sql) {
  const checksum = migrationChecksum(sql)

  await client.query('BEGIN')
  try {
    await client.query(sql)
    await client.query(
      `
        INSERT INTO schema_migrations (filename, checksum, source)
        VALUES ($1, $2, 'migration_runner')
      `,
      [filename, checksum]
    )
    await client.query('COMMIT')
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // Ignore rollback failures; original query error is more useful.
    }
    throw error
  }
}

function syncLocalStateFromDbRows(rows) {
  const applied = rows.map((row) => row.filename).sort()
  saveState({ applied })
}

async function main() {
  const env = loadEnvLocal()
  const databaseUrl = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL_UNPOOLED or DATABASE_URL required for migrations')
  }

  const localState = loadState()
  const migrationFiles = listMigrationFiles()
  const migrationFilesByName = new Map(
    migrationFiles.map((file) => [file, fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')])
  )

  const client = createClient(databaseUrl)
  await client.connect()

  try {
    await ensureSchemaMigrationsTable(client)

    let appliedRows = await loadAppliedMigrationsFromDb(client)
    if (appliedRows.length === 0) {
      const bootstrapped = await bootstrapLedgerFromLocalState(client, localState, migrationFilesByName)
      if (bootstrapped > 0) {
        console.log(`apply-migrations: bootstrapped schema_migrations from local state (${bootstrapped} entries)`)
        appliedRows = await loadAppliedMigrationsFromDb(client)
      } else {
        const hasExistingSchema = await detectExistingSchemaMarkers(client)
        if (hasExistingSchema) {
          throw new Error(
            'schema_migrations is empty but the target database already contains migrated tables. Refusing to guess migration history without a bootstrap source.'
          )
        }
      }
    }

    const appliedNames = new Set(appliedRows.map((row) => row.filename))
    const pending = migrationFiles.filter((file) => !appliedNames.has(file))

    if (pending.length === 0) {
      syncLocalStateFromDbRows(appliedRows)
      console.log('apply-migrations: no pending migrations')
      return
    }

    for (const file of pending) {
      console.log(`apply-migrations: running ${file}`)
      await runMigration(client, file, migrationFilesByName.get(file))
    }

    appliedRows = await loadAppliedMigrationsFromDb(client)
    syncLocalStateFromDbRows(appliedRows)
    console.log(`apply-migrations: applied ${pending.length} migration(s)`)
  } finally {
    await client.end()
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}

module.exports = {
  main,
}
