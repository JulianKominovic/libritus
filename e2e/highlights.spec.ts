import { test, expect } from '@playwright/test'
import { launchApp } from './helpers/launch'
import { leaveToHome, tmpAppData, waitForSession, excalidrawCanvas } from './helpers/canvas'
import { openPdf, readSessionFile, seedLibrary, seedNoteElement, seedSession } from './helpers/seed'

test('text select creates locked pdfHighlight then exits mode', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-hl-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)

    const selectBtn = page.getByRole('button', { name: 'Select text' })
    await selectBtn.click()
    await expect(selectBtn).toHaveAttribute('aria-pressed', 'true')

    // Wait for pdf.js text layer span
    const span = page.locator('.textLayer span').filter({ hasText: 'Libritus' }).first()
    await span.waitFor({ state: 'visible', timeout: 60_000 })
    const box = await span.boundingBox()
    if (!box) throw new Error('text span has no box')

    await page.mouse.move(box.x + 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 6 })
    await page.mouse.up()

    await expect(page.getByText('Unsaved')).toBeVisible({ timeout: 15_000 })
    // Mode exits after one selection
    await expect(selectBtn).toHaveAttribute('aria-pressed', 'false')

    await leaveToHome(page)

    const snap = await waitForSession(
      () => readSessionFile(appDataDir, pdfId),
      (s) =>
        (s.elements ?? []).some(
          (el) =>
            el &&
            typeof el === 'object' &&
            (el as { customData?: { pdfHighlight?: boolean }; locked?: boolean }).customData
              ?.pdfHighlight === true &&
            (el as { locked?: boolean }).locked === true
        )
    )
    expect(snap.elements?.length).toBeGreaterThan(0)
  } finally {
    await close()
  }
})

test('leave with Unsaved writes session via flush', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-flush-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })

  await seedSession(appDataDir, pdfId, {
    version: 1,
    docId: pdfId,
    updatedAt: new Date().toISOString(),
    camera: { scrollX: 0, scrollY: 0, zoom: 1 },
    elements: [seedNoteElement({ id: 'n1', text: 'before leave' })]
  })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)
    await expect(page.getByText('before leave')).toBeVisible({ timeout: 30_000 })

    // Nudge camera via page next (even on 1-page doc may no-op) — place note instead
    await page.getByRole('button', { name: 'Place note' }).click()
    const canvas = await excalidrawCanvas(page)
    const cbox = await canvas.boundingBox()
    if (!cbox) throw new Error('no canvas')
    await page.mouse.click(cbox.x + 300, cbox.y + 300)
    await expect(page.getByText('Unsaved')).toBeVisible({ timeout: 10_000 })

    await leaveToHome(page)

    const snap = await waitForSession(
      () => readSessionFile(appDataDir, pdfId),
      (s) => {
        const notes = (s.elements ?? []).filter(
          (el) =>
            (el as { customData?: { pdfNote?: boolean } }).customData?.pdfNote === true
        )
        return notes.length >= 2
      }
    )
    expect(snap.version).toBe(1)
    expect(snap.docId).toBe(pdfId)
  } finally {
    await close()
  }
})
