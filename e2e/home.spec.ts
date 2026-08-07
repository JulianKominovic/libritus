import { test, expect } from '@playwright/test'
import { tmpAppData } from './helpers/canvas'
import { launchApp } from './helpers/launch'
import { seedLibrary } from './helpers/seed'

test('empty library shows onboarding, not continue reading', async () => {
  const { page, close } = await launchApp()
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await expect(page.getByRole('heading', { name: 'Upload a PDF' })).toBeVisible()
    await expect(page.locator('main').getByRole('button', { name: 'Create category' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Continue reading' })).toHaveCount(0)
  } finally {
    await close()
  }
})

test('seeded library shows continue reading and opens PDF', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-home-')
  await seedLibrary({ appDataDir })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await expect(page.getByRole('heading', { name: 'Continue reading' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Upload a PDF' })).toHaveCount(0)

    await expect(page.locator('main').getByRole('link', { name: 'E2E' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'See all' })).toBeVisible()
    await expect(page.locator('main').getByRole('button', { name: 'Create category' })).toBeVisible()
    await expect(page.getByText('Drop a PDF anywhere to add it')).toBeVisible()

    await page.getByRole('link', { name: 'See all' }).click()
    await expect(page.locator('input.text-5xl')).toHaveValue('E2E', { timeout: 15_000 })

    await page.getByLabel('breadcrumb').getByRole('link', { name: 'Home' }).click()
    await expect(page.getByRole('heading', { name: 'Continue reading' })).toBeVisible({
      timeout: 15_000
    })

    await page.locator('main').getByRole('link', { name: 'Sample' }).click()
    await expect(page.getByLabel('Current page')).toBeVisible({ timeout: 60_000 })
  } finally {
    await close()
  }
})
