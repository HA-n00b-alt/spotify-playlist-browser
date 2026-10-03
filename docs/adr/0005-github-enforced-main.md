---
id: adr.github_enforced_main
title: "GitHub protects main and runs verify on every pull request"
status: accepted
date: 2026-10-03
---

## Context

ADR 0001 made `pnpm run verify` the gate and left open whether GitHub also enforces it (#9). Until
now the only enforcement was local: the `pre-commit` and `pre-push` hooks and `npm run pr`. Nothing
on GitHub stopped a direct push to `main`, a force-push, a merge commit, or a merge with failing
checks, and hooks can be skipped with `--no-verify` or never installed.

delman-pfm stays local-only because it is private on the free plan, where rulesets and Actions
minutes are not available. This repository is public, so both are free. The options were:

1. **Local-only**, as delman-pfm: repo settings and a ruleset for pull requests, no CI.
2. **GitHub-enforced**: the same, plus a workflow that runs verify on each pull request and a
   ruleset that requires it to pass.

## Decision

Option 2.

- **Merge settings:** squash merge only (merge commits and rebase merges are off), the pull request
  title becomes the squash commit title, and the branch is deleted on merge.
- **Ruleset `main`** on the default branch, with no bypass actors: changes arrive only through a
  pull request, no force-push, no deletion, linear history required, and the `verify` status check
  from GitHub Actions must pass. Approving reviews are not required: there is one maintainer.
- **`.github/workflows/verify.yml`** runs `pnpm install --frozen-lockfile` and `npm run verify` on
  `pull_request`, with Node 24 and the pnpm version from `packageManager`. Its job is named
  `verify`; the ruleset depends on that name.
- **No secrets in CI.** GitHub Actions still holds nothing from this repository (ADR 0004). With
  `CI=true`, `check:env-contract` checks the catalog and generated docs but skips the master
  `.env.local` checks, which keep running on every local verify and before every deploy.

## Consequences

- A change reaches `main` only through a squash-merged pull request whose verify passed on GitHub,
  whatever happened on the laptop. The local hooks remain the fast feedback loop.
- The maintainer cannot push to `main` directly either. A fix for a broken `main` goes through a
  pull request, or the ruleset is edited in the repository settings.
- A pull request opened before the workflow existed has no `verify` check and cannot merge until a
  new commit (or a rebase onto `main`) triggers one.
- Renaming the workflow job breaks the required check; change the ruleset in the same step.
- The env-contract check on GitHub is weaker than the local one: a missing or wrong value in the
  master `.env.local` is caught only locally and by `deploy:production`.
