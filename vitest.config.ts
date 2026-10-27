import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // World generation runs a 200-day economy check, so some tests take seconds.
    testTimeout: 120000,
  },
});
