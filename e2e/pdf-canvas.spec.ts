import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test, expect } from '@playwright/test'
import { launchApp } from './helpers/launch'
import { openPdf, seedLibrary } from './helpers/seed'

test('opens seeded PDF and shows page navigator', async () => {
  const appDataDir = await mkdtemp(path.join(tmpdir(), 'libritus-e2e-pdf-'))
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })

    await openPdf(page, categoryId, pdfId)

    await expect(page.getByLabel('Current page')).toBeVisible()
    await expect(page.getByLabel('Next page')).toBeVisible()
  } finally {
    await close()
  }
})
