# Agents Guide — spotify-playlist-browser

This file is the **single source of the development workflow** for humans and AI agents (Claude
Code, Codex, Cursor, …). `CLAUDE.md` only points here, so a workflow change is a one-file edit.
Adapted from `delman-pfm`'s `AGENTS.md` §0, scaled down for this repo.

## 0. Agent workflow

**Session kickoff (every request):** read this file with the Read tool, not from memory. If the
request has an issue, read it (`gh issue view <n> --comments`) and **claim it** (below) before
planning or editing.

**Rename the session as soon as the task is known** — right after claiming the issue, before
planning — to `<XXXX> - <brief description>`: the zero-padded issue number and 3–4 words, e.g.
`0010 - Spotify token expiry`. The branch and worktree carry the same identity. Use `0000` for work
that warrants no issue. Do it with your harness's rename action; it is often a deferred tool you
must load first:

- **Claude Code desktop app:** load `mcp__ccd_session_mgmt__set_session_title` with ToolSearch
  (`select:mcp__ccd_session_mgmt__set_session_title`), then call it with `session_id: "self"`. If
  the maintainer named the session by hand, the app asks them to approve the new title.
- **Claude Code CLI:** suggest the maintainer runs `/rename <title>`.
- **Other harnesses:** use their rename action if they have one; otherwise skip this step.

**The delivery loop, in one line:** sync `main` from `origin` → worktree + branch for the issue →
claim the issue → work → verify → check it still merges into `origin/main` → push and open a pull
request → **stop**. Merging and deploying are the maintainer's call, never the agent's.

### GitHub Issues

Tasks are **GitHub issues on `HA-n00b-alt/spotify-playlist-browser`**, through the `gh` CLI.

```bash
gh issue view 42 --comments                # read one issue
gh issue list --label status:in-progress   # what is being worked on
gh issue list --search "token"             # search
```

**Create an issue when the work needs planning, decisions, or handoff notes.** Skip it for
questions, lookups and obvious one-line fixes. Use the form at `.github/ISSUE_TEMPLATE/task.yml`,
or `gh issue create` with the same three headings: `### Description`, `### Acceptance Criteria`,
`### Context links`. Acceptance criteria are `- [ ] AC<N> …` checkboxes — **`AC1`, never `#1`**:
GitHub renders a task-list item that starts with an issue reference as a tracked issue.

**Where each kind of writing goes:**

| What | Where | Why |
| --- | --- | --- |
| Description, acceptance criteria, context links | The issue **body** | Structured and stable |
| Implementation plan, notes, final summary | An issue **comment** | Parallel sessions editing one body overwrite each other |
| Ticking an acceptance criterion | The issue **body** (`gh issue edit`) | The checkbox state is the status |
| Definition of done | The **pull request** (`.github/pull_request_template.md`) | Every item is a property of the delivered diff |

**Labels.** Status: `status:todo`, `status:in-progress`; **done is a closed issue**. Areas: `auth`,
`bpm`, `credits`, `admin`, `database`, `infra`, plus GitHub's `bug`, `enhancement`,
`documentation`. No project board, no milestones.

**Claim the issue before you start** — before any planning or editing, every time, including an
issue you opened a moment ago:

```bash
gh issue edit 42 --add-label status:in-progress --remove-label status:todo
```

That label is the only way a parallel session can tell the task is taken. **If it is already set,
treat the issue as taken**: read its comments and `gh pr list --search 42`, and say what you found
in a comment before starting a rival branch. The label stays on until the PR merges; closing the
issue retires it.

### Worktree & branch rules

Work in an **isolated worktree, never directly on `main`**. Worktrees live under
`.claude/worktrees/` (gitignored); only the main checkout is ever on `main`.

**Step 1 — sync `main` with `origin`**, in the main checkout:

```bash
git -C "<main-checkout>" fetch origin
git -C "<main-checkout>" pull --ff-only origin main
```

If `--ff-only` refuses because local `main` has diverged, **stop and report it** — do not merge,
rebase or force anything. A diverged `main` is the maintainer's decision.

**Step 2 — worktree and branch share one name: `<XXXX>-<harness>-<3-4 word summary>`**, where
`<XXXX>` is the zero-padded issue number and `<harness>` is `claude`, `codex`, `cursor`, …:

```bash
git worktree add ".claude/worktrees/0042-claude-fix-token-expiry" \
  -b "0042-claude-fix-token-expiry" main
```

Create it by hand like this. Auto-provisioned worktrees get `claude/…` or `worktree-…` branch
prefixes that hide which issue and harness own them.

**Set the worktree up before running anything:**

```bash
pnpm install --frozen-lockfile   # a symlinked node_modules is refused
```

Do not copy, link, open or print `.env.local` or any other secret file. Verify, the env scripts and
`pnpm dev` read the master copy in the main checkout themselves, and print names only
([`docs/SECRETS-AND-ENVIRONMENT.md`](docs/SECRETS-AND-ENVIRONMENT.md), ADR 0004). A new variable
goes in `scripts/lib/envCatalog.js`, then `npm run generate:env-docs`.

Do not approve pnpm build scripts or commit the `allowBuilds` block pnpm may add to
`pnpm-workspace.yaml` during install — revert that file if it changes.

**Commits** use Conventional Commits with a scope and the issue number at the end:

```
feat(auth): discard expired refresh tokens on invalid_grant (#10)
fix(bpm): stop reporting cancelled streams to Sentry (#11)
docs(adr): record the Muso removal (#5)
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `style`. The subject says what the
system now does, in plain words. Commit only files that belong to the issue.

**Step 3 — verify, check mergeability, push, open the PR.** This is the agent's job, not something
to hand back as instructions:

```bash
npm run pr -- --title "<type(scope): summary (#42)>"   # --title optional when the branch has one commit
```

`npm run pr` (`scripts/pr.js`) checks the git hooks are installed, runs verify, checks the branch
still merges cleanly into `origin/main`, pushes, and opens the PR from
`.github/pull_request_template.md` with `Closes #<issue>` taken from the branch name. Then **edit the
PR body** (`gh pr edit <n> --body-file …`): Summary, the Definition of Done ticked honestly, and
Validation listing **only the checks actually run**. With a PR already open it verifies, pushes and
reports that PR. `npm run pr -- --dry-run` prints the plan. It uses `npm run`, not `pnpm run`,
until #22 is fixed.

A branch that is merely behind `origin/main` needs nothing. **A conflict is yours to clear**:
`git rebase origin/main`, resolve, `git rebase --continue`, re-run verify. **Rebase, never merge**
`main` into your branch. If the PR is already open, push the rebase with
`git push --force-with-lease`, never a bare `--force`.

**Git hooks** (`.githooks/`, installed by `prepare` on `pnpm install`; `npm run hooks:install` by
hand): `pre-commit` checks migration numbering, and `pre-push` runs verify when the pushed branch
already has an open PR, so a rebased force-push is gated too. If `gh` cannot answer, `pre-push`
skips loudly and the push continues. `--no-verify` bypasses both; never use it to get past a
failure.

**Migrations** are named `NNNN_<snake_case_name>.sql` (`0001` upwards, no gaps or duplicates). The
pre-2026-10 files keep their names and always run first (`scripts/lib/migrations.js`). Two branches
can take the same number without a git conflict; whoever merges second renames to the next free one.

**Step 4 — stop.** No local merge, no `gh pr merge`, unless the maintainer explicitly asks in this
session. A finished task is not that instruction. The maintainer merges with squash; the PR title
becomes the commit on `main`, so it must follow the commit format above.

### Deployment

**Agents never deploy.** `pnpm run deploy:production` runs from the maintainer's laptop, from an
up-to-date `main`. If a change needs a production step (a migration, a new secret, a data fix), say
so in the PR and in the completion message.

### Talking to the maintainer

Replies in chat use **functional language**: describe what the app does for its users ("signed-out
users are sent back to the Spotify login"), not the files and functions that implement it. Lead with
the answer, keep it brief, and say plainly when something is unverified. File paths only when the
maintainer has to open that file. Issue bodies, PRs, ADRs and code comments keep full technical
detail.

**Completion message** ends with: Branch · Pull request (URL) · Summary · Files changed ·
Validation (only checks actually run) · Issues opened (number and title of any follow-up issue,
created directly rather than proposed) · Production steps needed · Known risks.

## 1. Project essentials

- **Stack:** Next.js 14 (App Router) on Vercel, React 18, TypeScript, Tailwind. Package manager
  **pnpm**. Database: Neon Postgres (`lib/db.ts`). Error tracking: Sentry. Analytics: Umami.
- **External services:** Spotify Web API (user OAuth), a BPM/key analysis service on Google Cloud
  Run (`lib/bpm.ts`), MusicBrainz, Deezer and iTunes for previews and metadata.
- **Layout:** `app/` pages and API routes, `lib/` business logic, `scripts/` tooling (verify,
  migrations, deploy), `migrations/` SQL migrations, `setup.sql` fresh-install schema.
- **Checks:** `pnpm run verify` (`scripts/verify.js`).
- **Docs:** `README.md` overview, `INSTALL.md` setup, `ARCHITECTURE.md` system design,
  `PIPELINES-LOGGING-ANALYTICS-STANDARDS.md`, `BPM API DOCUMENTATION.md`, ADRs in `docs/adr/` (#5).
- **Secrets:** never print, commit or paste secret values. The main checkout's `.env.local` is the
  master copy; `.env.example` lists the names; `docs/SECRETS-AND-ENVIRONMENT.md` maps where each
  one lives. `npm run env:inventory`, `env:drift` and `env:sync` print names only.
