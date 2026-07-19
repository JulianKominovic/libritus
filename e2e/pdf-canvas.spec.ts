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

    // Canvas chrome must track :root --color-morphing-50 (not hardcoded neutral gray).
    const { canvasBg, morphing50 } = await page.evaluate(() => {
      const root = document.querySelector('[data-pdf-canvas-root]')
      const canvasBg = root ? getComputedStyle(root).backgroundColor : ''
      const probe = document.createElement('div')
      probe.style.backgroundColor = 'var(--color-morphing-50)'
      document.body.appendChild(probe)
      const morphing50 = getComputedStyle(probe).backgroundColor
      probe.remove()
      return { canvasBg, morphing50 }
    })
    expect(canvasBg).toBe(morphing50)
    expect(morphing50).not.toBe('')
  } finally {
    await close()
  }
})

test('prev / next / jump navigate multi-page PDF', async () => {
  const appDataDir = await mkdtemp(path.join(tmpdir(), 'libritus-e2e-nav-'))
  const { categoryId, pdfId } = await seedLibrary({
    appDataDir,
    pdfFixture: path.join(process.cwd(), 'e2e/fixtures/sample-2p.pdf'),
    pages: 2
  })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)

    const current = page.getByLabel('Current page')
    await expect(current).toHaveValue('1')

    await page.getByLabel('Next page').click()
    await expect(current).toHaveValue('2', { timeout: 10_000 })

    await page.getByLabel('Previous page').click()
    await expect(current).toHaveValue('1', { timeout: 10_000 })

    await current.fill('2')
    await current.press('Enter')
    await expect(current).toHaveValue('2', { timeout: 10_000 })
  } finally {
    await close()
  }
})
