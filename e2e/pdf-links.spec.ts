import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test, expect } from '@playwright/test'
import { closePdfSidebar } from './helpers/canvas'
import { launchApp } from './helpers/launch'
import { openPdf, seedLibrary } from './helpers/seed'

test('internal PDF link click jumps to target page', async () => {
  const appDataDir = await mkdtemp(path.join(tmpdir(), 'libritus-e2e-pdf-links-'))
  const { categoryId, pdfId } = await seedLibrary({
    appDataDir,
    pdfFixture: path.join(process.cwd(), 'e2e/fixtures/sample-links.pdf'),
    pages: 2
  })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)
    await closePdfSidebar(page)

    const current = page.getByLabel('Current page')
    await expect(current).toHaveValue('1')

    await page.locator('[data-pdf-page="0"]').waitFor({ state: 'visible', timeout: 60_000 })
    const link = page.locator('[data-pdf-link][data-target-page="1"]')
    await expect(link).toBeVisible({ timeout: 15_000 })

    // Arm `.pdf-text-pass` over the link so the overlay (under Excalidraw) receives the click.
    await expect
      .poll(
        async () => {
          const box = await link.boundingBox()
          if (!box) return false
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
          return page.evaluate(() =>
            document.querySelector('[data-pdf-canvas-root]')?.classList.contains('pdf-text-pass')
          )
        },
        { timeout: 10_000 }
      )
      .toBe(true)

    await link.click()

    await expect(current).toHaveValue('2', { timeout: 10_000 })
  } finally {
    await close()
  }
})
