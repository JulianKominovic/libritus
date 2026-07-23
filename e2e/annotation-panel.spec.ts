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

test('annotation panel lists items and jump selects note', async () => {
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
        text: 'panel highlight text'
      }),
      seedNoteElement({
        id: 'panel-note',
        x: 200,
        y: 400,
        text: 'panel note preview'
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
    await expect(
      page.getByRole('button', { name: 'Highlight: panel highlight text' })
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Note: panel note preview' })).toBeVisible()

    await page.getByRole('button', { name: 'Note: panel note preview' }).click()
    await expect(page.locator('[data-pdf-note]').filter({ hasText: 'panel note preview' })).toBeVisible({
      timeout: 10_000
    })
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
    await expect(page.getByText('No highlights or notes yet.')).toBeVisible()
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
        groupId
      }),
      seedHighlightElement({
        id: 'panel-g-b',
        x: 40,
        y: 124,
        text,
        groupId
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

    const rows = page.getByRole('button', { name: `Highlight: ${text}` })
    await expect(rows).toHaveCount(1)
  } finally {
    await close()
  }
})
