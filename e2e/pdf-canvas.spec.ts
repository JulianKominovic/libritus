import { copyFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test, expect } from '@playwright/test'
import { launchApp } from './helpers/launch'

const CAT_ID = 'e2e-cat'
const PDF_ID = 'e2e-pdf'

async function seedAppData(appDataDir: string): Promise<void> {
  await mkdir(appDataDir, { recursive: true })
  await copyFile(
    path.join(process.cwd(), 'e2e/fixtures/sample.pdf'),
    path.join(appDataDir, `${PDF_ID}.pdf`)
  )
  const categories = [
    {
      id: CAT_ID,
      name: 'E2E',
      description: 'e2e fixture',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      icon: 'circle-dot',
      color: '#555',
      pdfs: [
        {
          id: PDF_ID,
          name: 'Sample',
          filename: `${PDF_ID}.pdf`,
          src: `${PDF_ID}.pdf`,
          size: 869,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          pages: 1,
          thumbnail: '',
          author: '',
          hexColor: '#ffffff',
          creationDate: null,
          modificationDate: null,
          progress: { percentage: 0, pages: 0, offset: 0 }
        }
      ]
    }
  ]
  await writeFile(path.join(appDataDir, 'categories.json'), JSON.stringify(categories))
}

test('opens seeded PDF and shows page navigator', async () => {
  const appDataDir = await mkdtemp(path.join(tmpdir(), 'libritus-e2e-pdf-'))
  await seedAppData(appDataDir)

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })

    await page.evaluate(
      ({ categoryId, pdfId }) => {
        history.pushState(null, '', `/category/${categoryId}/${pdfId}`)
        window.dispatchEvent(new PopStateEvent('popstate'))
      },
      { categoryId: CAT_ID, pdfId: PDF_ID }
    )

    await expect(page.getByLabel('Current page')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByLabel('Next page')).toBeVisible()
  } finally {
    await close()
  }
})
