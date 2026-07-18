import { writeFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import { test, expect } from '@playwright/test'
import { launchApp } from './helpers/launch'
import { tmpAppData } from './helpers/canvas'
import {
  navigatePdf,
  openPdf,
  seedLibrary,
  seedNoteElement
} from './helpers/seed'

test('corrupt session JSON opens PDF with empty scene (no crash)', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-corrupt-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })
  await writeFile(path.join(appDataDir, `${pdfId}.session.json`), '{not-json!!!')

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)
    await expect(page.getByLabel('Current page')).toBeVisible()
    await expect(page.getByText('seeded note')).toHaveCount(0)
  } finally {
    await close()
  }
})

test('session version 2 treated as null — fresh scene', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-ver2-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })

  await writeFile(
    path.join(appDataDir, `${pdfId}.session.json`),
    JSON.stringify({
      version: 2,
      docId: pdfId,
      updatedAt: new Date().toISOString(),
      camera: { scrollX: 0, scrollY: 0, zoom: 1 },
      elements: [seedNoteElement({ id: 'legacy', text: 'SHOULD-NOT-RESTORE' })]
    })
  )

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)
    await expect(page.getByLabel('Current page')).toBeVisible()
    await expect(page.getByText('SHOULD-NOT-RESTORE')).toHaveCount(0)
  } finally {
    await close()
  }
})

test('missing PDF on disk shows load error', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-missing-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })
  await unlink(path.join(appDataDir, `${pdfId}.pdf`))

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await navigatePdf(page, categoryId, pdfId)
    await expect(page.getByText('PDF file not found')).toBeVisible({ timeout: 30_000 })
  } finally {
    await close()
  }
})
