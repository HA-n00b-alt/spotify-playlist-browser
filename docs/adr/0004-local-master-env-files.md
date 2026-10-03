---
id: adr.local_master_env_files
title: "Local files in the main checkout are the master copy of env and secrets; worktrees read them from there"
status: accepted
date: 2026-10-03
---

## Context

Agents work in worktrees under `.claude/worktrees/`, which start without the gitignored
`.env.local`. Agents may not read or copy secrets, so `check:env-contract` (and with it verify) and
the dev server failed in a worktree until the maintainer copied the file by hand; this blocked the
pull request for #10. Values were also spread over the local file, Vercel and Cloud Run with no map
of what belongs where, and `scripts/sync-secrets-vercel.js` pushed two hard-coded names.

Options considered for giving a worktree what it needs (#31):

1. **Resolve the main checkout's files.** Scripts locate the main checkout through
   `git rev-parse --git-common-dir` and read the master files there; the dev server gets the values
   through its process environment.
2. **Link the files into each new worktree** from a tracked `post-checkout` hook.
3. **Infisical as the source of truth** (#14), generating local files from it.

## Decision

- **The master copy of every local secret file lives in the main checkout** and stays gitignored:
  `.env.local` and `vercel-bpm-invoker-delman-site.json`. There is one copy; worktrees have none.
- **Option 1.** `scripts/lib/env.js` exports `MASTER_ROOT` (the main checkout) next to `ROOT` (the
  checkout running the script). Every script that reads env (`check-env-contract`, `env-remote`,
  `deploy-production`, `apply-migrations`, `post-deploy-verify`, the Blob manifest,
  `fix-env-local`, `check-spotify-audio-features`) reads `MASTER_ROOT/.env.local`. `pnpm dev`
  runs through `scripts/with-master-env.js`, which passes those values to `next dev` as process
  environment. Nothing is copied or linked into a worktree. `pnpm build` is unchanged: production
  builds run from the main checkout.
- **`scripts/lib/envCatalog.js` is the map**: every name, its purpose, whether it is secret, who owns
  its value (`source`) and which targets it belongs on (local, Vercel environments, GitHub Actions,
  Cloud Run services). `.env.example` (now tracked, names only) and the table in
  `docs/SECRETS-AND-ENVIRONMENT.md` are generated from it, and `check:env-contract` fails when code
  reads a name the catalog does not list.
- **Remotes are updated from the master files by script, names only.** `npm run env:sync` is a dry
  run by default and writes only with `--write`; `npm run env:drift` reports names-only drift;
  `npm run env:inventory` lists every name and where it is. No script prints a value: values travel
  through stdin or a temporary 0600 file that is deleted at once.
- **Only `source: 'local'` names are pushed.** Values that differ per environment
  (`SPOTIFY_REDIRECT_URI`, `NEXT_PUBLIC_BASE_URL`) are set by hand in Vercel; values written by a
  Marketplace integration (Neon, Blob) are owned by the integration. The sync never writes either.
- **Vercel preview is not a target.** Preview deployments are off (the project is not connected to
  git and the deploy runs from the laptop), so the synced names target production and development.
- **GitHub Actions and Cloud Run hold nothing from this repository today.** There are no workflows,
  and the BPM services' env belongs to the BPM service repository; `env-remote` inventories
  `bpm-service` (and checks the invoker binding) but never prunes it.

Option 2 was rejected because a link puts a readable path to the secret inside every worktree and
must be kept in step with each new file; option 1 keeps the secret files out of worktrees entirely.
Option 3 adds a hosted dependency and a login for a one-maintainer project; this decision keeps local
files as master, so #14 should be closed or re-scoped.

## Consequences

- A fresh worktree runs `npm run verify` and `pnpm dev` with no setup step for env; the maintainer is
  never asked to copy a file.
- The rule that agents do not read secrets is still behavioural: a worktree process can read the
  main checkout. What changes is that no task needs to.
- Adding a variable means adding it to the catalog and running `npm run generate:env-docs`; verify
  fails otherwise.
- `deploy:production` now syncs every `source: 'local'` name to Vercel production and development
  (previously only the BPM pair). Names whose values already match are not rewritten; sensitive
  ones, which Vercel never returns, are rewritten on every deploy as before.
- `env:sync` can write to GitHub (secrets via stdin, variables) and to Cloud Run (plain, non-secret
  values only; secrets there belong in Secret Manager, which is disabled in `delman-site`).
