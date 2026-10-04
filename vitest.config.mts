import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname) },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{js,ts}'],
    // Vitest's 5 s default assumes an idle machine. Tests that spawn git or node, or walk the
    // repo, run 10-100x slower when verify shares a loaded machine or the agent sandbox (#39,
    // #44, #46): at load ~80 the worktree test took over 35 s. A hang still fails, just later.
    testTimeout: 120_000,
    // Worker threads, not forked processes: under that load Vitest's own fixed 60 s limit for a
    // forked worker to start was exceeded, and no setting raises it. Threads start in-process.
    pool: 'threads',
  },
})
