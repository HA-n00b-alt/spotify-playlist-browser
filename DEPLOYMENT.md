# Deployment

Production is `https://searchmyplaylist.delman.it`, a Vercel project. It is deployed by one
command, from the maintainer's laptop, from an up-to-date `main`:

```bash
pnpm run deploy:production
```

The Vercel project is not connected to git: pushing to GitHub deploys nothing, and preview
deployments are off. Agents never deploy (`AGENTS.md`). The script is
`scripts/deploy-production.js`; its guards are `scripts/lib/deploy/guards.js`.

## Before the first deploy

- **Vercel CLI login and project link.** The script calls `npx vercel`, which needs `vercel login`
  and a `.vercel/` link to the project in the main checkout (`vercel link`).
- **Master `.env.local`** in the main checkout, filled in (`INSTALL.md`, Step 3). The deploy reads
  it for the migrations, the env sync, the manifest and the post-deploy check.
- **Deploy manifest in Vercel Blob:** `BLOB_READ_WRITE_TOKEN` in `.env.local`, and optionally
  `DEPLOY_MANIFEST_BLOB_PATH` (default `deployment-manifests/spotify-playlist-browser.json`).
  See [Setting Up Vercel Blob Deploy Manifest](INSTALL.md#setting-up-vercel-blob-deploy-manifest).
- **BPM service credentials** (`BPM_SERVICE_URL`, `GCP_SERVICE_ACCOUNT_KEY`) for the post-deploy
  check.

## What the command does

Each step prints one PASS/FAIL line; the first failure stops the run and later steps do not run.

1. **Guard: clean `main`.** Aborts unless the checkout is on `main` with no staged, unstaged or
   untracked changes. Ignored files (`.vercel/`, `.deploy/`, `.env.local`) do not count.
2. **Fast-forward from `origin/main`.** Fetches, re-checks the guard, aborts if `main` has commits
   `origin/main` lacks (unpushed or diverged), then `git merge --ff-only origin/main`. The commit
   it lands on is the one deployed.
3. **Verify.** The same steps as `pnpm run verify` (listed in `INSTALL.md`).
4. **Read the deployment manifest** from Vercel Blob and print the last recorded deployment.
5. **Apply migrations** (`scripts/apply-migrations.js`) to the production database from
   `DATABASE_URL_UNPOOLED` (or `DATABASE_URL`). Pending files in `migrations/` run in order, each
   in its own transaction, and are recorded in the `schema_migrations` table.
6. **Sync env to Vercel** (`env:sync --only=vercel --write`): pushes the names the catalog owns
   from the master `.env.local` to Vercel production
   ([`docs/SECRETS-AND-ENVIRONMENT.md`](docs/SECRETS-AND-ENVIRONMENT.md)).
7. **Guard again.** The working tree must still be clean and `HEAD` must not have moved.
8. **Build and deploy.** `vercel pull --yes --environment=production`, `vercel build --prod`
   (on the laptop, with the pinned pnpm; Sentry source maps upload during this build), then
   `vercel deploy --prebuilt --prod`.
9. **Write the manifest.** Appends
   `{ timestamp, commit, dirty: false, platform: "vercel", productionUrl }` to the manifest in
   Vercel Blob. Nothing is written to the repository; the deploy never commits or pushes.
10. **Post-deploy verify** (`scripts/post-deploy-verify.js`): production `/api/bpm/health` must
    answer `"ok": true`, and the BPM service's `/health` must answer when called with an identity
    token minted from `GCP_SERVICE_ACCOUNT_KEY`. Run the same check on its own, without deploying,
    with `pnpm run verify:production`.

### Dry run

```bash
DRY_RUN=1 pnpm run deploy:production
```

Prints the plan and the guard verdict against the last-fetched `origin/main` (`WOULD ABORT — …`
instead of aborting), then skips every other step. It does not fetch, build or write anything.

### Options

| Variable | Effect |
| --- | --- |
| `DRY_RUN=1` | Plan and guard verdict only |
| `PRODUCTION_URL` | URL checked after the deploy (default `https://searchmyplaylist.delman.it`) |

## When it aborts

- **Not on `main`, or uncommitted changes.** Land the work through a pull request (or discard
  it), `git pull` on `main`, deploy again. The script will not commit or push for you.
- **Unpushed or diverged commits on `main`.** `main` only advances through pull requests; move
  those commits to a branch and reset `main` to `origin/main`.
- **Failure after migrations.** Migrations already applied stay applied and the previous
  deployment keeps serving. Fix the cause and re-run; applied migrations are skipped.
- **Post-deploy verify fails.** The new version is already live and recorded in the manifest.
  Investigate, then roll back (below) if users are affected.

## The manifest

The manifest is a JSON file in Vercel Blob listing every production deploy, oldest first:

```json
{
  "deployments": [
    {
      "timestamp": "2026-10-03T09:00:00.000Z",
      "commit": "<full sha>",
      "dirty": false,
      "platform": "vercel",
      "productionUrl": "https://searchmyplaylist.delman.it"
    }
  ]
}
```

Entries before #13 may carry `gitHash` instead of `commit`, and may be `dirty: true`: until then
the deploy built whatever was in the working folder. The file used to be mirrored to
`.deploy/manifest.json` and committed; it now lives only in Blob.

## Rollback

There is no rollback script. Two ways back, fastest first:

1. **Instant rollback in Vercel.** `npx vercel rollback <deployment-url>` (or the dashboard:
   Deployments → a previous production deployment → Instant Rollback) points the domain back at
   an earlier build; `npx vercel rollback status` reports progress. Nothing is rebuilt and the
   manifest is not updated, so note the rollback in the issue. After a rollback Vercel can stop
   giving the domain to new production deploys automatically: after the next
   `deploy:production`, check the site serves the new build, and `npx vercel promote <url>` it if
   not.
2. **Revert and redeploy.** Revert the bad commit through a pull request, merge it, and run
   `pnpm run deploy:production`. This keeps `main`, production and the manifest in agreement and
   is the way to make a rollback permanent.

**Migrations are not rolled back** by either path. They are expected to be backward compatible
with the previous release; if one is not, write a new migration that undoes it and deploy that.
Undoing env changes means editing the master `.env.local` and re-running
`npm run env:sync -- --only=vercel --write`.
