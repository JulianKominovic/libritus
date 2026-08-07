import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  timeout: 20_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: "50%",
  retries: 1,
  reporter: 'list'
})
