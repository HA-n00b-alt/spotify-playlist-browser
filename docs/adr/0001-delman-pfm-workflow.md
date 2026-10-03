---
id: adr.delman_pfm_workflow
title: "Issue-first workflow with pull requests, local verify and laptop deploys"
status: accepted
date: 2026-10-03
---

## Context

Until October 2026 every change went straight to `main` and there was no record of what was being
worked on or why. The deploy script (`scripts/deploy-production.js`) builds whatever is in the
working folder, so production ran 44 uncommitted files from the 2026-06-07 deploy until they were
committed on 2026-10-03 (`dd05cae`, `f277def`, `09cac96`). Nothing on GitHub matched production for
four months, and losing the laptop would have lost the live code.

The maintainer also works with several AI agent sessions in parallel, which need a shared way to see
what is taken and a consistent shape for branches, commits and pull requests.

delman-pfm already runs a workflow that solves both problems. The options were to adopt it, write
a lighter one from scratch, or keep committing to `main`. Migrating hosting from Vercel to
Cloudflare Workers, as delman-pfm did, was considered and deferred.

## Decision

Adopt delman-pfm's workflow, scaled down for this repo. `AGENTS.md` is the operational source of
truth (#4); this ADR records the choice and the reasons.

- **Issues are the task list.** Work that needs planning, decisions or handoff starts as a GitHub
  issue in the Task layout (Description, `AC<N>` acceptance criteria, Context links). The
  `status:todo` / `status:in-progress` labels show what is taken; a closed issue is done (#3).
- **One worktree and branch per issue**, named `<XXXX>-<harness>-<summary>`, under
  `.claude/worktrees/`. Nobody commits to `main` directly.
- **Conventional Commits** with a scope and the issue number, e.g. `docs(adr): … (#5)`.
- **Pull requests** follow the PR template (`Closes #N`, Summary, Definition of Done, Validation
  listing only the checks actually run). The maintainer squash-merges; the PR title becomes the
  commit on `main`.
- **`pnpm run verify` is the gate**, run locally before pushing (#6 restructures it; #7 adds a
  pre-push hook and `npm run pr`). Whether GitHub also enforces it is a separate decision (#9).
- **Deploys stay on the maintainer's laptop** via `pnpm run deploy:production`, from an up-to-date
  `main`. #13 makes the script refuse anything else.
- **Agents never merge or deploy.** They stop once the pull request is open.
- **Decisions are recorded as ADRs** in this directory (#5).

## Consequences

- Every production build can be traced to a commit on GitHub. Once #13 lands, a dirty or unpushed
  tree can't be deployed.
- Parallel agent sessions coordinate through issue labels and separate worktrees instead of editing
  the same checkout.
- Small changes cost more: an issue, a branch and a pull request instead of a direct commit. Obvious
  one-line fixes can skip the issue (use `0000` as the number), but not the pull request.
- Until #9 is decided, enforcement is local only. Nothing on GitHub stops a direct push to `main`
  or a merge with failing checks.
- Laptop deploys keep the maintainer's machine as a single point of failure for releasing. That's
  accepted for now and would be revisited with any hosting migration.
