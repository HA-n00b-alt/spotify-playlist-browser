# Architecture Decision Records (ADRs)

ADRs record the *why* behind choices that are expensive to reverse or easy to undo by accident.
`ARCHITECTURE.md` describes how the system works today; an ADR says why it works that way and what
a change would have to reckon with.

The format follows delman-pfm's `docs/ADR-WORKFLOW.md`, without its machine-checked verification
anchors or knowledge-graph sync.

## Writing one

1. Copy [`0000-template.md`](0000-template.md) to `NNNN-short-slug.md`, using the next free
   four-digit number.
2. Fill in the front matter (`id`, `title`, `status`, `date`) and the **Context**, **Decision** and
   **Consequences** sections.
3. Add a row to the index below. Its `Status` must match the file's `status:`.
4. Never rewrite a decision in place. To reverse one, write a new ADR, set the old one's `status:` to
   `superseded` with `supersededBy: adr.<new id>`, and make its index row read
   `superseded by [NNNN](NNNN-….md)`.

Write an ADR when a pull request locks in a choice a future contributor might reasonably undo, such
as removing an integration, picking a platform or service, or changing how work is shipped. Routine
fixes and features don't need one.

## Index

| ID | Title | Status |
|---|---|---|
| `adr.delman_pfm_workflow` | [Issue-first workflow with PRs, local verify and laptop deploys](0001-delman-pfm-workflow.md) | accepted |
| `adr.remove_muso` | [Remove the Muso.ai integration](0002-remove-muso.md) | accepted |
| [0003](0003-vitest-keep-eslint.md) | Test with Vitest and keep ESLint rather than moving to Biome | accepted |
| [0004](0004-local-master-env-files.md) | Local files in the main checkout are the master copy of env and secrets; worktrees read them from there | accepted |
| [0005](0005-github-enforced-main.md) | GitHub protects main and runs verify on every pull request | accepted |
