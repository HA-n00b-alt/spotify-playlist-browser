/**
 * Migration file naming and order (#7).
 *
 * New migrations are named `NNNN_<snake_case_name>.sql`: a four-digit number, unique, with no gaps,
 * starting at 0001. Numbers are picked per worktree, so two parallel branches can both add `0003_…`
 * and git reports no conflict because the file names differ. The `pre-commit` hook and the
 * `migration numbering` verify step catch that before the second pull request merges.
 *
 * The files below predate the numbering and keep their names, because `schema_migrations` records
 * applied migrations by file name. They always run before every numbered migration: a plain sort
 * would put `0001_…` ahead of `add_…` and run it against a database those files have not built yet.
 */

/** @type {ReadonlyArray<string>} */
const LEGACY_MIGRATIONS = Object.freeze([
  'add_admin_access_requests.sql',
  'add_admin_settings.sql',
  'add_admin_user_profile_fields.sql',
  'add_admin_users.sql',
  'add_credits_cache.sql',
  'add_external_api_usage.sql',
  'add_isrc_mismatch_reviews.sql',
  'add_spotify_access_requests.sql',
  'add_track_credits_cache.sql',
  'backfill_bpm_selected.sql',
  'drop_playlist_order.sql',
  'update_credits_cache_filters.sql',
])

const NUMBERED_RE = /^(\d{4})_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/

/**
 * @param {string} name
 * @returns {number | null} the migration number, or null when the name is not a numbered migration
 */
function migrationNumber(name) {
  const match = NUMBERED_RE.exec(name)
  return match ? Number(match[1]) : null
}

/**
 * Problems with the `.sql` file names in `migrations/`, one line each. Empty means healthy.
 *
 * @param {string[]} names file names (not paths); non-`.sql` files are ignored
 * @returns {string[]}
 */
function migrationNumberingProblems(names) {
  /** @type {string[]} */
  const problems = []
  /** @type {Map<number, string[]>} */
  const byNumber = new Map()

  for (const name of names.filter((n) => n.endsWith('.sql')).sort()) {
    if (LEGACY_MIGRATIONS.includes(name)) continue
    const number = migrationNumber(name)
    if (number === null) {
      problems.push(`${name}: not named NNNN_<snake_case_name>.sql`)
      continue
    }
    byNumber.set(number, [...(byNumber.get(number) ?? []), name])
  }

  for (const [number, files] of byNumber) {
    if (files.length > 1) {
      problems.push(`${String(number).padStart(4, '0')} is used by ${files.length} files: ${files.join(', ')}`)
    }
  }

  const highest = Math.max(0, ...byNumber.keys())
  for (let number = 1; number <= highest; number += 1) {
    if (!byNumber.has(number)) {
      problems.push(`${String(number).padStart(4, '0')} is missing (numbers must run 0001, 0002, … with no gaps)`)
    }
  }

  return problems
}

/**
 * The order migrations are applied in: legacy files by name, then numbered files by number.
 *
 * @param {string[]} names `.sql` file names
 * @returns {string[]}
 */
function orderMigrationFiles(names) {
  const legacy = names.filter((name) => migrationNumber(name) === null).sort()
  const numbered = names
    .filter((name) => migrationNumber(name) !== null)
    .sort((a, b) => migrationNumber(a) - migrationNumber(b) || a.localeCompare(b))
  return [...legacy, ...numbered]
}

module.exports = { LEGACY_MIGRATIONS, migrationNumber, migrationNumberingProblems, orderMigrationFiles }
