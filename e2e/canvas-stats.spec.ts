import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { expectSaved, tmpAppData } from './helpers/canvas'
import { launchApp } from './helpers/launch'
import {
  openPdf,
  seedHighlightElement,
  seedLibrary,
  seedNoteElement,
  seedSearchCaptureElement,
  seedSession
} from './helpers/seed'

async function openCategory(page: Page, categoryId: string): Promise<void> {
  await page.evaluate((id) => {
    history.pushState(null, '', `/category/${id}`)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, categoryId)
  await page.getByRole('heading', { name: /\d+ pdfs/ }).waitFor({ state: 'visible', timeout: 30_000 })
}

async function waitForCanvasStats(
  appDataDir: string,
  pdfId: string,
  expected: { highlights: number; notes: number; searches: number },
  timeoutMs = 15_000
): Promise<void> {
  const catPath = path.join(appDataDir, 'categories.json')
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const categories = JSON.parse(await readFile(catPath, 'utf8')) as Array<{
        pdfs: Array<{
          id: string
          canvasStats?: { highlights: number; notes: number; searches?: number }
        }>
      }>
      const pdf = categories.flatMap((c) => c.pdfs).find((p) => p.id === pdfId)
      if (
        pdf?.canvasStats?.highlights === expected.highlights &&
        pdf.canvasStats.notes === expected.notes &&
        (pdf.canvasStats.searches ?? 0) === expected.searches
      ) {
        return
      }
    } catch {
      // catalog not written yet
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(
    `waitForCanvasStats timed out for ${pdfId} expected=${JSON.stringify(expected)}`
  )
}

test('opening annotated session writebacks canvasStats to category card', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-canvas-stats-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })

  await seedSession(appDataDir, pdfId, {
    version: 1,
    docId: pdfId,
    updatedAt: new Date().toISOString(),
    camera: { scrollX: 0, scrollY: 0, zoom: 1 },
    elements: [
      seedHighlightElement({ id: 'stats-hl-1', text: 'one' }),
      seedHighlightElement({ id: 'stats-hl-2', x: 40, y: 130, text: 'two' }),
      seedNoteElement({ id: 'stats-note', text: 'a note' }),
      seedSearchCaptureElement({ id: 'stats-search', query: 'web' })
    ]
  })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)
    await expectSaved(page)

    await waitForCanvasStats(appDataDir, pdfId, { highlights: 2, notes: 1, searches: 1 })

    await openCategory(page, categoryId)
    const card = page.getByRole('link', { name: 'Sample' })
    await expect(card).toBeVisible({ timeout: 30_000 })
    await expect(card.getByText('2', { exact: true })).toBeVisible()
    await expect(card.getByText('1', { exact: true })).toHaveCount(2) // note + search
  } finally {
    await close()
  }
})
