const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { LEGACY_MIGRATIONS, migrationNumberingProblems, orderMigrationFiles } = require('../scripts/lib/migrations')

const ROOT = path.resolve(__dirname, '..')

test('the committed migrations/ directory passes', () => {
  assert.deepEqual(migrationNumberingProblems(fs.readdirSync(path.join(ROOT, 'migrations'))), [])
})

test('legacy and well-numbered files pass; non-sql files are ignored', () => {
  assert.deepEqual(
    migrationNumberingProblems([...LEGACY_MIGRATIONS, '0001_drop_muso_cache.sql', '0002_add_x.sql', 'README.md']),
    []
  )
})

test('a new unnumbered or badly named file fails', () => {
  assert.equal(migrationNumberingProblems(['add_new_table.sql']).length, 1)
  assert.equal(migrationNumberingProblems(['1_add_x.sql']).length, 1)
  assert.equal(migrationNumberingProblems(['0001-add-x.sql']).length, 1)
  assert.equal(migrationNumberingProblems(['0001_Add_X.sql']).length, 1)
})

test('a duplicate number fails, naming both files', () => {
  const problems = migrationNumberingProblems(['0001_a.sql', '0001_b.sql'])
  assert.deepEqual(problems, ['0001 is used by 2 files: 0001_a.sql, 0001_b.sql'])
})

test('a gap fails, naming the missing number', () => {
  assert.deepEqual(migrationNumberingProblems(['0001_a.sql', '0003_c.sql']), [
    '0002 is missing (numbers must run 0001, 0002, … with no gaps)',
  ])
  assert.equal(migrationNumberingProblems(['0002_b.sql']).length, 1)
})

test('legacy migrations run before numbered ones, numbered ones in number order', () => {
  assert.deepEqual(orderMigrationFiles(['0002_b.sql', 'drop_playlist_order.sql', '0001_a.sql', 'add_admin_users.sql']), [
    'add_admin_users.sql',
    'drop_playlist_order.sql',
    '0001_a.sql',
    '0002_b.sql',
  ])
})
