import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test, expect } from '@playwright/test'
import { launchApp } from './helpers/launch'
import { openPdf, seedLibrary } from './helpers/seed'

test('outline entry and thumb jump to page', async () => {
  const appDataDir = await mkdtemp(path.join(tmpdir(), 'libritus-e2e-outline-'))
  const { categoryId, pdfId } = await seedLibrary({
    appDataDir,
    pdfFixture: path.join(process.cwd(), 'e2e/fixtures/sample-outline.pdf'),
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

    const sidebar = page.getByLabel('Document outline, page thumbnails, and annotations')
    await expect(sidebar).toBeVisible()

    await page.getByRole('button', { name: /Go to Chapter Two/ }).click()
    await expect(current).toHaveValue('2', { timeout: 10_000 })

    await page.getByRole('tab', { name: 'Pages' }).click()
    await page.getByRole('button', { name: 'Go to page 1' }).click()
    await expect(current).toHaveValue('1', { timeout: 10_000 })
  } finally {
    await close()
  }
})

test('thumb click navigates on PDF without outline', async () => {
  const appDataDir = await mkdtemp(path.join(tmpdir(), 'libritus-e2e-thumbs-'))
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

    await expect(
      page.getByLabel('Document outline, page thumbnails, and annotations')
    ).toBeVisible()
    // No outline → Pages tab is default; click thumb for page 2
    await page.getByRole('button', { name: 'Go to page 2' }).click()
    await expect(current).toHaveValue('2', { timeout: 10_000 })
  } finally {
    await close()
  }
})
