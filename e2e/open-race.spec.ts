import { test, expect } from '@playwright/test'
import { launchApp } from './helpers/launch'
import { tmpAppData } from './helpers/canvas'
import {
  navigatePdf,
  openPdf,
  seedExtraPdf,
  seedLibrary,
  seedNoteElement,
  seedSession
} from './helpers/seed'

test('rapid A→B open does not show A notes on B', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-race-')
  const { categoryId, pdfId: pdfA } = await seedLibrary({
    appDataDir,
    pdfId: 'e2e-pdf-a'
  })
  const { pdfId: pdfB } = await seedExtraPdf({
    appDataDir,
    categoryId,
    pdfId: 'e2e-pdf-b'
  })

  await seedSession(appDataDir, pdfA, {
    version: 1,
    docId: pdfA,
    updatedAt: new Date().toISOString(),
    camera: { scrollX: 0, scrollY: 0, zoom: 1 },
    elements: [seedNoteElement({ id: 'note-a', text: 'ONLY-ON-PDF-A' })]
  })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })

    // Start opening A, then immediately switch to B (no wait for A's restore)
    await navigatePdf(page, categoryId, pdfA)
    await navigatePdf(page, categoryId, pdfB)
    await page.getByLabel('Current page').waitFor({ state: 'visible', timeout: 60_000 })

    await expect(page.getByText('ONLY-ON-PDF-A')).toHaveCount(0, { timeout: 5_000 })
    await expect(page.getByLabel('Current page')).toBeVisible()

    // Sanity: opening A alone still shows the note
    await openPdf(page, categoryId, pdfA)
    await expect(page.getByText('ONLY-ON-PDF-A')).toBeVisible({ timeout: 30_000 })
  } finally {
    await close()
  }
})
