import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Force all integration tests to use tm_game_test (never tm_game).
    // Runs once per worker before any test file — see setup-env.js for why.
    setupFiles: ['./tests/helpers/setup-env.js'],
    // #1117: infrastructure precondition (mongod reachable + markdown/
    // corpus present). Distinct from setupFiles — globalSetup runs exactly
    // once, before any worker starts, which is what makes "the run refuses
    // to start" true rather than a per-file abort. See global-setup.js.
    globalSetup: ['./tests/helpers/global-setup.js'],
    // Integration tests share a real MongoDB connection — run serially to avoid
    // one file's teardown closing the connection while another file is still using it.
    fileParallelism: false,
    pool: 'forks',
    maxWorkers: 1,
    // Issue #1124: the 10s vitest default has no real headroom over Atlas under
    // full-suite contention — api-downtime-regent-gate observed 14068ms against
    // that default and is otherwise a clean 12/12 in isolation. Raised globally,
    // not per-file — under load there's no reason to think that file is uniquely
    // slow, and the next-slowest file becomes the new flaky member the moment
    // Atlas has a bad day.
    hookTimeout: 30000,
  },
});
