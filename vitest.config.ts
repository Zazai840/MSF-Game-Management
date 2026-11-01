import { defineConfig } from 'vitest/config';
// API tests drive Postgres over many calls; 5s is too tight when several builds share the machine.
export default defineConfig({test: {include: ['tests/**/*.test.ts'], fileParallelism: false, testTimeout: 20000}});
