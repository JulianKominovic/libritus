import { createServer, type Server } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { tmpAppData } from './helpers/canvas'
import { launchApp } from './helpers/launch'
import { navigateCategory, seedLibrary } from './helpers/seed'

const SAMPLE_PDF = path.join(process.cwd(), 'e2e/fixtures/sample.pdf')
const PAGE_HTML =
  '<!doctype html><html><head><title>Printed Page</title></head><body><p>Hello</p></body></html>'

async function serveFixtures(): Promise<{ origin: string; close: () => Promise<void> }> {
  const pdf = await readFile(SAMPLE_PDF)
  const server: Server = createServer((req, res) => {
    const url = req.url?.split('?')[0] ?? '/'
    const isHead = req.method === 'HEAD'
    if (url === '/page') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(isHead ? undefined : PAGE_HTML)
      return
    }
    if (url === '/doc.pdf' || url === '/disguised') {
      res.writeHead(200, {
        'content-type': 'application/pdf',
        'content-length': pdf.byteLength
      })
      res.end(isHead ? undefined : pdf)
      return
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const addr = server.address()
  if (!addr || typeof addr === 'string') throw new Error('no listen port')
  return {
    origin: `http://127.0.0.1:${addr.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()))
      })
  }
}

async function openCategory(page: Page, categoryId: string): Promise<void> {
  await navigateCategory(page, categoryId)
  await page
    .getByRole('heading', { name: /\d+ pdfs/ })
    .waitFor({ state: 'visible', timeout: 30_000 })
}

async function submitUrl(page: Page, url: string): Promise<void> {
  await page.getByPlaceholder('https://…').fill(url)
  await page.getByRole('button', { name: 'Download page as PDF' }).click()
}

test('HTML URL prints the live page into the library', async () => {
  test.setTimeout(60_000)
  const appDataDir = await tmpAppData('libritus-e2e-url-html-')
  const { categoryId } = await seedLibrary({ appDataDir })
  const server = await serveFixtures()
  const { page, close } = await launchApp({ appDataDir })
  try {
    await openCategory(page, categoryId)
    await submitUrl(page, `${server.origin}/page`)
    await expect(page.getByRole('button', { name: 'Page saved as PDF' })).toBeVisible({
      timeout: 45_000
    })
    await expect(page.getByRole('heading', { name: '2 pdfs' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Printed Page' })).toBeVisible()
  } finally {
    await close()
    await server.close()
  }
})

test('.pdf URL fetches bytes instead of printing the viewer', async () => {
  test.setTimeout(60_000)
  const appDataDir = await tmpAppData('libritus-e2e-url-pdf-')
  const { categoryId } = await seedLibrary({ appDataDir })
  const server = await serveFixtures()
  const { page, close } = await launchApp({ appDataDir })
  try {
    await openCategory(page, categoryId)
    await submitUrl(page, `${server.origin}/doc.pdf`)
    await expect(page.getByRole('button', { name: 'Page saved as PDF' })).toBeVisible({
      timeout: 45_000
    })
    await expect(page.getByRole('heading', { name: '2 pdfs' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'doc' })).toBeVisible()
  } finally {
    await close()
    await server.close()
  }
})

test('PDF content-type without .pdf in the path fetches bytes', async () => {
  test.setTimeout(60_000)
  const appDataDir = await tmpAppData('libritus-e2e-url-mime-')
  const { categoryId } = await seedLibrary({ appDataDir })
  const server = await serveFixtures()
  const { page, close } = await launchApp({ appDataDir })
  try {
    await openCategory(page, categoryId)
    await submitUrl(page, `${server.origin}/disguised`)
    await expect(page.getByRole('button', { name: 'Page saved as PDF' })).toBeVisible({
      timeout: 45_000
    })
    await expect(page.getByRole('heading', { name: '2 pdfs' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'disguised' })).toBeVisible()
  } finally {
    await close()
    await server.close()
  }
})
