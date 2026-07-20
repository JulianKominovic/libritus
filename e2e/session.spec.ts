import { test, expect } from '@playwright/test'
import { launchApp } from './helpers/launch'
import { leaveToHome, waitForSession, clickScene, closePdfSidebar, tmpAppData } from './helpers/canvas'
import {
  openPdf,
  readSessionFile,
  seedLibrary,
  seedNoteElement,
  seedSession
} from './helpers/seed'

test('restores seeded note and flushes place-note on leave', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-session-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })

  await seedSession(appDataDir, pdfId, {
    version: 1,
    docId: pdfId,
    updatedAt: new Date().toISOString(),
    camera: { scrollX: 0, scrollY: 0, zoom: 1 },
    elements: [seedNoteElement({ id: 'seed-note', x: 200, y: 150, text: 'seeded note' })]
  })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)

    await expect(page.getByText('seeded note')).toBeVisible({ timeout: 30_000 })
    await closePdfSidebar(page)

    await page.getByRole('button', { name: 'Place note' }).click()
    await clickScene(page, 400, 350)
    await expect(page.getByText('Unsaved')).toBeVisible({ timeout: 10_000 })

    await leaveToHome(page)

    const snap = await waitForSession(
      () => readSessionFile(appDataDir, pdfId),
      (s) => {
        const notes = (s.elements ?? []).filter(
          (el) =>
            el &&
            typeof el === 'object' &&
            (el as { customData?: { pdfNote?: boolean } }).customData?.pdfNote === true
        )
        return notes.length >= 2
      }
    )
    expect(
      (snap.elements ?? []).some(
        (el) =>
          el &&
          typeof el === 'object' &&
          JSON.stringify((el as { customData?: unknown }).customData).includes('seeded note')
      )
    ).toBe(true)

    await openPdf(page, categoryId, pdfId)
    await expect(page.getByText('seeded note')).toBeVisible({ timeout: 30_000 })
  } finally {
    await close()
  }
})
