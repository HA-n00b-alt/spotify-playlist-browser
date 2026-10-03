#!/usr/bin/env node
/**
 * Fail when a file in `migrations/` breaks the naming rules in `scripts/lib/migrations.js` (#7).
 * Run by the `pre-commit` hook and by `pnpm run verify`.
 */
const fs = require('node:fs')
const path = require('node:path')
const { ROOT } = require('./lib/env')
const { migrationNumberingProblems } = require('./lib/migrations')

const MIGRATIONS_DIR = path.join(ROOT, 'migrations')

const names = fs.existsSync(MIGRATIONS_DIR) ? fs.readdirSync(MIGRATIONS_DIR) : []
const problems = migrationNumberingProblems(names)

if (problems.length > 0) {
  console.error('migrations/ numbering is broken:\n')
  for (const problem of problems) console.error(`  - ${problem}`)
  console.error(
    '\nNew migrations are named NNNN_<snake_case_name>.sql, numbered 0001 upwards with no gaps or' +
      '\nduplicates. If another branch took your number first, rename yours to the next free one.'
  )
  process.exit(1)
}

console.log(`migrations/ numbering OK (${names.filter((n) => n.endsWith('.sql')).length} files)`)
