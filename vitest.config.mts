import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: false,
    // Each database-backed file boots its own embedded Postgres. Running them
    // in parallel just makes several instances fight for the same memory, so
    // files run one at a time; tests within a file still run concurrently.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: { '@': path.resolve(process.cwd()) },
  },
});
