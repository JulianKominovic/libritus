import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { launchApp } from './helpers/launch'
import { navigateCategory, seedTwoCategories } from './helpers/seed'

async function openCategory(page: Page, categoryId: string): Promise<void> {
  await navigateCategory(page, categoryId)
  await page.getByRole('heading', { name: /\d+ pdfs/ }).waitFor({ state: 'visible', timeout: 30_000 })
}

/** One HTML5 drag gesture onto `dest`. Leaves button down when `dropTarget` is visible. */
async function startDragOntoCategory(page: Page, card: Locator, dest: Locator): Promise<void> {
  await page.mouse.up().catch(() => undefined)
  await card.scrollIntoViewIfNeeded()
  await dest.scrollIntoViewIfNeeded()
  const from = await card.boundingBox()
  const to = await dest.boundingBox()
  if (!from || !to) throw new Error('missing bounding boxes')

  const fromX = from.x + from.width / 2
  const fromY = from.y + from.height / 2
  const toX = to.x + to.width / 2
  const toY = to.y + to.height / 2
  await page.mouse.move(fromX, fromY)
  await page.mouse.down()
  // Past Chromium's drag threshold, then onto the sidebar category.
  await page.mouse.move(fromX + 16, fromY + 16, { steps: 6 })
  await page.mouse.move(toX, toY, { steps: 30 })
  await expect(page.locator('.sidebar-drop-target')).toHaveCount(1, { timeout: 1500 })
}

test('leaving a category mid-drag clears drop-target highlight', async () => {
  test.setTimeout(60_000)
  const appDataDir = await mkdtemp(path.join(tmpdir(), 'libritus-e2e-dnd-cancel-'))
  const { sourceId } = await seedTwoCategories({ appDataDir })
  const { page, close } = await launchApp({ appDataDir })
  try {
    await openCategory(page, sourceId)

    const card = page.getByRole('link', { name: /Sample/ })
    await expect(card).toBeVisible({ timeout: 30_000 })
    const dest = page.getByRole('complementary').getByText('Dest', { exact: true })
    await expect(dest).toBeVisible()

    // HTML5 DnD in Electron is flaky under load — retry until drop-target paints.
    await expect(async () => {
      await startDragOntoCategory(page, card, dest)
    }).toPass({ timeout: 20_000 })

    const home = page.getByRole('complementary').getByRole('link', { name: 'Home' })
    const homeBox = await home.boundingBox()
    if (!homeBox) throw new Error('missing home box')
    await page.mouse.move(homeBox.x + homeBox.width / 2, homeBox.y + homeBox.height / 2, {
      steps: 16
    })
    await page.mouse.up()

    await expect(page.locator('.sidebar-drop-target')).toHaveCount(0)
  } finally {
    await close()
  }
})

test('dropping a PDF card onto a sidebar category moves it', async () => {
  test.setTimeout(60_000)
  const appDataDir = await mkdtemp(path.join(tmpdir(), 'libritus-e2e-dnd-move-'))
  const { sourceId, destId, pdfId } = await seedTwoCategories({ appDataDir })
  const { page, close } = await launchApp({ appDataDir })
  try {
    await openCategory(page, sourceId)

    const card = page.getByRole('link', { name: /Sample/ })
    await expect(card).toBeVisible({ timeout: 30_000 })
    const dest = page.getByRole('complementary').getByText('Dest', { exact: true })

    // Hover can paint the drop-target without a real `drop` — retry until the move sticks.
    await expect(async () => {
      await startDragOntoCategory(page, card, dest)
      const to = await dest.boundingBox()
      if (!to) throw new Error('missing dest box')
      await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 2 })
      await page.mouse.up()
      await expect(page.getByRole('heading', { name: '0 pdfs' })).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })

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
