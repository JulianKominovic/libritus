import { test, expect } from '@playwright/test'
import { launchApp } from './helpers/launch'
import { tmpAppData } from './helpers/canvas'
import { openPdf, seedLibrary } from './helpers/seed'

test('chat tab shows index status and blocks send without key', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-rag-chat-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir, pages: 2 })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)

    const sidebar = page.getByLabel(/Document outline/)
    await expect(sidebar).toBeVisible()

    await page.getByRole('tab', { name: 'Chat' }).click()
    await expect(page.getByText(/Add an OpenRouter key in Settings/i)).toBeVisible({
      timeout: 10_000
    })
    await expect(page.getByText(/Index/i).first()).toBeVisible()
    await expect(
      page.getByText(/Ready|Indexing|Queued|Downloading|Waiting|No extractable/i).first()
    ).toBeVisible({ timeout: 120_000 })

    const send = page.getByRole('button', { name: 'Send' })
    await expect(send).toBeDisabled()
  } finally {
    await close()
  }
})

test('settings AI section is reachable', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-rag-settings-')
  await seedLibrary({ appDataDir, pages: 1 })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await page.getByRole('link', { name: 'Settings' }).click()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'AI' })).toBeVisible()
    await expect(page.getByText(/OpenRouter API key/i)).toBeVisible()
    await expect(page.getByText(/Embeddings run locally/i)).toBeVisible()
  } finally {
    await close()
  }
})
