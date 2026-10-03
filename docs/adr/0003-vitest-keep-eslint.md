---
id: adr.vitest_keep_eslint
title: "Test with Vitest and keep ESLint rather than moving to Biome"
status: accepted
date: 2026-10-03
---

## Context

The only tests ran under `node --test` as plain CommonJS, which cannot import the TypeScript in
`lib/` or mock `next/headers`, `fetch` and the database. The riskiest logic (Spotify token refresh)
lives in `lib/spotify.ts`, so the runner had to handle TypeScript, the `@/` path alias and module
mocks. Issue #8 also asked whether Biome should replace ESLint at the same time.

## Decision

- **Vitest** is the test runner (`vitest.config.mts`, `npm run test`, the `test` verify step). The
  existing `node --test` files were ported by swapping only the `test` import.
- **ESLint stays.** `next lint` provides the `next/core-web-vitals` rules, which Biome does not
  replicate, and the lint step already passes. A formatter/linter swap would also touch every file
  for no user-facing benefit. Revisit if Next.js drops `next lint` (it is deprecated from Next 15)
  or if lint time becomes a real cost.

## Consequences

- TypeScript modules can be unit tested with mocked cookies, `fetch` and logger; new tests go in
  `tests/*.test.ts`.
- The BPM stream error path in `app/hooks/useBpmAnalysis.ts` is not yet covered: it waits for #11,
  which changes that path.
