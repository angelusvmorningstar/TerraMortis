import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration tests share a real MongoDB connection — run serially to avoid
    // one file's teardown closing the connection while another file is still using it.
    fileParallelism: false,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
