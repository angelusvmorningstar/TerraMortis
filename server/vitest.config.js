import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Force all integration tests to use tm_game_test (never tm_game).
    // Runs once per worker before any test file — see setup-env.js for why.
    setupFiles: ['./tests/helpers/setup-env.js'],
    // Integration tests share a real MongoDB connection — run serially to avoid
    // one file's teardown closing the connection while another file is still using it.
    fileParallelism: false,
    pool: 'forks',
    maxWorkers: 1,
  },
});
