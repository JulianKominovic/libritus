import { test, expect } from '@playwright/test'
import { launchApp } from './helpers/launch'

test('app opens to home', async () => {
  const { page, close } = await launchApp()
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
  } finally {
    await close()
  }
})
