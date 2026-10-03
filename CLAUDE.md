# CLAUDE.md

**The development workflow lives in exactly one place: [`AGENTS.md`](AGENTS.md).** Read it with the
Read tool at the start of every session, not from memory and not from this summary.

What it covers, so you know you need it on every request:

- Tasks are GitHub issues on `HA-n00b-alt/spotify-playlist-browser`; claim one with the
  `status:in-progress` label before planning or editing.
- Rename the session to `<XXXX> - <brief description>` right after claiming the issue (load the
  `mcp__ccd_session_mgmt__set_session_title` tool, call it with `session_id: "self"`).
- Work in a worktree under `.claude/worktrees/`, named `<XXXX>-claude-<summary>` after the issue,
  never on `main`.
- Finish by running verify, pushing the branch and opening a pull request, then stop. Agents never
  merge and never deploy.
- Replies to the maintainer use functional, non-technical language.
