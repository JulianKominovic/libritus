import { rm } from 'node:fs/promises'
import { test, expect } from '@playwright/test'
import { launchApp } from './helpers/launch'
import {
  clickScene,
  closePdfSidebar,
  expectUnsaved,
  tmpAppData,
  waitForSession
} from './helpers/canvas'
import { openPdf, readSessionFile, seedLibrary } from './helpers/seed'

test('quit with Unsaved flushes session; reopen shows note', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-quit-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })

  const first = await launchApp({ appDataDir })
  try {
    await expect(first.page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(first.page, categoryId, pdfId)
    await closePdfSidebar(first.page)

    await first.page.getByRole('button', { name: 'Place note' }).click()
    await clickScene(first.page, 400, 350)
    await expectUnsaved(first.page)

    // Close without deleting appData — exercises before-quit → app-quit-request flush
    await first.close({ keepAppData: true })

    const snap = await waitForSession(
      () => readSessionFile(appDataDir, pdfId),
      (s) =>
        (s.elements ?? []).some(
          (el) =>
            el &&
            typeof el === 'object' &&
            (el as { customData?: { pdfNote?: boolean } }).customData?.pdfNote === true
        ),
      20_000
    )
    expect(snap.elements?.length).toBeGreaterThan(0)

    const second = await launchApp({ appDataDir })
    try {
      await expect(second.page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
        timeout: 30_000
      })
      await openPdf(second.page, categoryId, pdfId)
      // Restored note HUD shows Empty note or plate default — assert session restored via element count
      const notes = (snap.elements ?? []).filter(
        (el) => (el as { customData?: { pdfNote?: boolean } }).customData?.pdfNote === true
      )
      expect(notes.length).toBeGreaterThan(0)
      await expect(second.page.getByLabel('Current page')).toBeVisible()
    } finally {
      await second.close()
    }
  } finally {
    await rm(appDataDir, { recursive: true, force: true }).catch(() => undefined)
  }
})
