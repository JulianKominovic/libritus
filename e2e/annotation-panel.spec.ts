import { test, expect } from '@playwright/test'
import { launchApp } from './helpers/launch'
import { tmpAppData } from './helpers/canvas'
import {
  openPdf,
  seedHighlightElement,
  seedLibrary,
  seedNoteElement,
  seedSession
} from './helpers/seed'

test('annotation panel lists items and jump centers note', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-ann-panel-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir, pages: 2 })

  await seedSession(appDataDir, pdfId, {
    version: 1,
    docId: pdfId,
    updatedAt: new Date().toISOString(),
    camera: { scrollX: 0, scrollY: 0, zoom: 1 },
    elements: [
      seedHighlightElement({
        id: 'panel-hl',
        x: 40,
        y: 100,
        text: 'panel highlight text',
        createdAt: '2026-01-01T00:00:00.000Z'
      }),
      seedNoteElement({
        id: 'panel-note',
        x: 200,
        y: 400,
        text: 'panel note preview',
        createdAt: '2026-01-02T00:00:00.000Z'
      })
    ]
  })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)

    const sidebar = page.getByLabel(/Document outline/)
    await expect(sidebar).toBeVisible()

    await page.getByRole('tab', { name: 'Annotations' }).click()
    // Newest first: note before highlight
    const noteRow = page.getByRole('button', { name: /Note: panel note preview/ })
    const hlRow = page.getByRole('button', { name: /Highlight.*panel highlight text/ })
    await expect(noteRow).toBeVisible()
    await expect(hlRow).toBeVisible()
    await expect(hlRow).toContainText(/Page \d+/)

    await noteRow.click()
    await expect(
      page.locator('[data-pdf-note]').filter({ hasText: 'panel note preview' })
    ).toBeVisible({ timeout: 10_000 })
  } finally {
    await close()
  }
})

test('annotation panel empty state', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-ann-empty-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)

    await expect(page.getByLabel(/Document outline/)).toBeVisible()
    await page.getByRole('tab', { name: 'Annotations' }).click()
    await expect(page.getByText('No annotations yet.')).toBeVisible()
  } finally {
    await close()
  }
})

test('annotation panel shows one row per highlight group', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-ann-group-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })
  const groupId = 'panel-group'
  const text = 'grouped panel highlight'

  await seedSession(appDataDir, pdfId, {
    version: 1,
    docId: pdfId,
    updatedAt: new Date().toISOString(),
    camera: { scrollX: 0, scrollY: 0, zoom: 1 },
    elements: [
      seedHighlightElement({
        id: 'panel-g-a',
        x: 40,
        y: 100,
        text,
        groupId,
        createdAt: '2026-01-01T00:00:00.000Z'
      }),
      seedHighlightElement({
        id: 'panel-g-b',
        x: 40,
        y: 124,
        text,
        groupId,
        createdAt: '2026-01-01T00:00:00.000Z'
      })
    ]
  })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)

    await expect(page.getByLabel(/Document outline/)).toBeVisible()
    await page.getByRole('tab', { name: 'Annotations' }).click()

    const rows = page.getByRole('button', { name: new RegExp(`Highlight.*${text}`) })
    await expect(rows).toHaveCount(1)
  } finally {
    await close()
  }
})
