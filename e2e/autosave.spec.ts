import { test, expect } from '@playwright/test'
import { launchApp } from './helpers/launch'
import {
  clickScene,
  closePdfSidebar,
  expectSaved,
  expectUnsaved,
  tmpAppData,
  waitForSession
} from './helpers/canvas'
import { openPdf, readSessionFile, seedLibrary } from './helpers/seed'

test('autosave debounce writes session without leave', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-autosave-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)
    await closePdfSidebar(page)

    await page.getByRole('button', { name: 'Place note' }).click()
    await clickScene(page, 400, 350)
    await expectUnsaved(page)

    // AUTOSAVE_DEBOUNCE_MS = 5000 — wait past debounce without navigating away
    await page.waitForTimeout(5_500)
    await expectSaved(page)

    const snap = await waitForSession(
      () => readSessionFile(appDataDir, pdfId),
      (s) =>
        (s.elements ?? []).some(
          (el) =>
            el &&
            typeof el === 'object' &&
            (el as { customData?: { pdfNote?: boolean } }).customData?.pdfNote === true
        )
    )
    expect(snap.elements?.length).toBeGreaterThan(0)
  } finally {
    await close()
  }
})
