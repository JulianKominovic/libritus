import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test, expect } from '@playwright/test'
import { launchApp } from './helpers/launch'
import { closePdfSidebar } from './helpers/canvas'
import { openPdf, seedLibrary } from './helpers/seed'

test('search finds text, shows hit, Escape closes', async () => {
  const appDataDir = await mkdtemp(path.join(tmpdir(), 'libritus-e2e-search-'))
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)
    await closePdfSidebar(page)

    const searchBtn = page.getByRole('button', { name: 'Search', exact: true })
    await expect(searchBtn).toBeVisible()
    await searchBtn.click()
    await expect(searchBtn).toHaveAttribute('aria-pressed', 'true')

    const input = page.getByLabel('Search PDF')
    await expect(input).toBeVisible()
    await input.fill('Libritus')

    await expect(page.getByText('1/1')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-testid="pdf-search-hit"]').first()).toBeVisible()

    await input.press('Escape')
    await expect(input).toBeHidden()
    await expect(searchBtn).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('[data-testid="pdf-search-hit"]')).toHaveCount(0)
  } finally {
    await close()
  }
})

test('search next / prev cycles matches across pages', async () => {
  const appDataDir = await mkdtemp(path.join(tmpdir(), 'libritus-e2e-search-nav-'))
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
    await closePdfSidebar(page)

    await page.getByRole('button', { name: 'Search', exact: true }).click()
    const input = page.getByLabel('Search PDF')
    await input.fill('Libritus')

    await expect(page.getByText('1/2')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-testid="pdf-search-hit"]').first()).toBeVisible()

    await page.getByLabel('Next match').click()
    await expect(page.getByText('2/2')).toBeVisible({ timeout: 10_000 })

    await page.getByLabel('Previous match').click()
    await expect(page.getByText('1/2')).toBeVisible({ timeout: 10_000 })
  } finally {
    await close()
  }
})
