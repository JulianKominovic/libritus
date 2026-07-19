import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { launchApp } from './helpers/launch'
import { seedTwoCategories } from './helpers/seed'

async function openCategory(page: Page, categoryId: string): Promise<void> {
  await page.evaluate((id) => {
    history.pushState(null, '', `/category/${id}`)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, categoryId)
  await page.getByRole('heading', { name: /\d+ pdfs/ }).waitFor({ state: 'visible', timeout: 30_000 })
}

async function dragCardToward(
  page: Page,
  from: { x: number; y: number; width: number; height: number },
  to: { x: number; y: number; width: number; height: number }
): Promise<void> {
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 16 })
}

test('leaving a category mid-drag clears drop-target highlight', async () => {
  const appDataDir = await mkdtemp(path.join(tmpdir(), 'libritus-e2e-dnd-cancel-'))
  const { sourceId } = await seedTwoCategories({ appDataDir })
  const { page, close } = await launchApp({ appDataDir })
  try {
    await openCategory(page, sourceId)

    const card = page.getByRole('link', { name: 'Sample' })
    await expect(card).toBeVisible({ timeout: 30_000 })
    const dest = page.getByRole('complementary').getByText('Dest', { exact: true })
    await expect(dest).toBeVisible()

    const cardBox = await card.boundingBox()
    const destBox = await dest.boundingBox()
    if (!cardBox || !destBox) throw new Error('missing bounding boxes')

    await dragCardToward(page, cardBox, destBox)
    await expect(page.locator('.sidebar-drop-target')).toHaveCount(1)

    const home = page.getByRole('complementary').getByRole('link', { name: 'Home' })
    const homeBox = await home.boundingBox()
    if (!homeBox) throw new Error('missing home box')
    await page.mouse.move(homeBox.x + homeBox.width / 2, homeBox.y + homeBox.height / 2, {
      steps: 12
    })
    await page.mouse.up()

    await expect(page.locator('.sidebar-drop-target')).toHaveCount(0)
  } finally {
    await close()
  }
})

test('dropping a PDF card onto a sidebar category moves it', async () => {
  const appDataDir = await mkdtemp(path.join(tmpdir(), 'libritus-e2e-dnd-move-'))
  const { sourceId, destId, pdfId } = await seedTwoCategories({ appDataDir })
  const { page, close } = await launchApp({ appDataDir })
  try {
    await openCategory(page, sourceId)

    const card = page.getByRole('link', { name: 'Sample' })
    await expect(card).toBeVisible({ timeout: 30_000 })
    const dest = page.getByRole('complementary').getByText('Dest', { exact: true })

    const cardBox = await card.boundingBox()
    const destBox = await dest.boundingBox()
    if (!cardBox || !destBox) throw new Error('missing bounding boxes')

    await dragCardToward(page, cardBox, destBox)
    await expect(page.locator('.sidebar-drop-target')).toHaveCount(1)
    await page.mouse.up()

    await expect(page.getByRole('heading', { name: '0 pdfs' })).toBeVisible({ timeout: 10_000 })

    const catalog = JSON.parse(
      await readFile(path.join(appDataDir, 'categories.json'), 'utf8')
    ) as Array<{ id: string; pdfs: Array<{ id: string }> }>
    const source = catalog.find((c) => c.id === sourceId)
    const destination = catalog.find((c) => c.id === destId)
    expect(source?.pdfs.map((p) => p.id)).not.toContain(pdfId)
    expect(destination?.pdfs.map((p) => p.id)).toContain(pdfId)
  } finally {
    await close()
  }
})
