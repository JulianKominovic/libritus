import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test, expect } from '@playwright/test'
import { launchApp } from './helpers/launch'
import {
  clickScene,
  closePdfSidebar,
  leaveToHome,
  moveScene,
  tmpAppData
} from './helpers/canvas'
import {
  openPdf,
  seedLibrary,
  seedNoteElement,
  seedSearchCaptureElement,
  seedSession
} from './helpers/seed'

/** 1×1 PNG for promoted search-image fixtures. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

async function seedAttachmentPng(appDataDir: string, fileId: string): Promise<void> {
  const dir = path.join(appDataDir, 'attachments')
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, `${fileId}.png`), TINY_PNG)
}

async function expectHintHidden(hint: import('@playwright/test').Locator): Promise<void> {
  await expect(hint).toHaveCSS('opacity', '0')
}

async function expectHintVisible(hint: import('@playwright/test').Locator): Promise<void> {
  await expect(hint).toHaveCSS('opacity', '1')
}

test('note activate hint appears only on hover', async () => {
  test.setTimeout(60_000)
  const appDataDir = await tmpAppData('libritus-e2e-note-hint-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })
  const noteX = 200
  const noteY = 150

  await seedSession(appDataDir, pdfId, {
    version: 1,
    docId: pdfId,
    updatedAt: new Date().toISOString(),
    camera: { scrollX: 0, scrollY: 0, zoom: 1 },
    elements: [seedNoteElement({ id: 'hint-note', x: noteX, y: noteY, text: 'hover hint note' })]
  })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)
    await closePdfSidebar(page)

    const note = page.locator('[data-pdf-note]').filter({ hasText: 'hover hint note' }).first()
    await expect(note).toBeVisible({ timeout: 30_000 })
    const hint = note.locator('[data-embed-activate-hint]')
    await expect(hint).toBeAttached()
    await expectHintHidden(hint)
    await expect(note).not.toHaveAttribute('data-activate-hint-hover')

    // Away from the note first.
    await moveScene(page, 500, 500)
    await expectHintHidden(hint)

    // Hover via DOM box (inactive embeds are PE-none; host hit-tests scene under cursor).
    const noteBox = await note.boundingBox()
    if (!noteBox) throw new Error('note not laid out')
    await page.mouse.move(noteBox.x + noteBox.width * 0.1, noteBox.y + noteBox.height * 0.1, {
      steps: 5
    })
    await expect(note).toHaveAttribute('data-activate-hint-hover', '', { timeout: 5_000 })
    await expectHintVisible(hint)
    await expect(hint.getByText('Click to edit')).toBeVisible()

    await moveScene(page, 500, 500)
    await expect(note).not.toHaveAttribute('data-activate-hint-hover')
    await expectHintHidden(hint)

    // Center click still activates (hint is pointer-events-none).
    await page.mouse.click(noteBox.x + noteBox.width / 2, noteBox.y + noteBox.height / 2)
    await expect(page.locator('[contenteditable="true"]')).toHaveCount(1, { timeout: 5_000 })
    await expect(note.locator('[data-embed-activate-hint]')).toHaveCount(0)
  } finally {
    await close()
  }
})

test('search placeholder activate hint appears only on hover', async () => {
  test.setTimeout(60_000)
  const appDataDir = await tmpAppData('libritus-e2e-search-hint-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })
  const capX = 80
  const capY = 40
  const capW = 300
  const capH = 300

  await seedSession(appDataDir, pdfId, {
    version: 1,
    docId: pdfId,
    updatedAt: new Date().toISOString(),
    camera: { scrollX: 0, scrollY: 0, zoom: 1 },
    elements: [
      seedSearchCaptureElement({
        id: 'cap-hint',
        x: capX,
        y: capY,
        width: capW,
        height: capH,
        query: 'hint query',
        url: 'https://example.com'
      })
    ]
  })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)
    await closePdfSidebar(page)

    const capture = page.locator('[data-pdf-search-capture]').first()
    await expect(capture).toBeVisible({ timeout: 15_000 })
    const hint = capture.locator('[data-embed-activate-hint]')
    await expectHintHidden(hint)

    await moveScene(page, 500, 500)
    await expectHintHidden(hint)

    const capBox = await capture.boundingBox()
    if (!capBox) throw new Error('capture not laid out')
    await page.mouse.move(capBox.x + capBox.width * 0.1, capBox.y + capBox.height * 0.1, {
      steps: 5
    })
    await expect(capture).toHaveAttribute('data-activate-hint-hover', '', { timeout: 5_000 })
    await expectHintVisible(hint)
    await expect(hint.getByText('Click to browse')).toBeVisible()

    await moveScene(page, 500, 500)
    await expectHintHidden(hint)
  } finally {
    await close()
  }
})

test('note activate hint screen size stays stable across zoom', async () => {
  test.setTimeout(90_000)
  const appDataDir = await tmpAppData('libritus-e2e-hint-zoom-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })
  const noteX = 50
  const noteY = 50
  const noteEl = seedNoteElement({ id: 'hint-zoom-note', x: noteX, y: noteY, text: 'zoom hint note' })

  await seedSession(appDataDir, pdfId, {
    version: 1,
    docId: pdfId,
    updatedAt: new Date().toISOString(),
    camera: { scrollX: 0, scrollY: 0, zoom: 1 },
    elements: [noteEl]
  })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)
    await closePdfSidebar(page)

    const note = page.locator('[data-pdf-note]').filter({ hasText: 'zoom hint note' }).first()
    await expect(note).toBeVisible({ timeout: 30_000 })
    const pill = note.locator('[data-embed-activate-hint] span')

    async function hoverNoteAndMeasure(): Promise<number> {
      // Force host hittable — `.pdf-text-pass` makes `.excalidraw-host` PE-none so
      // the activate-hint pointermove listener never runs.
      await page.locator('[data-pdf-canvas-root]').evaluate((el) => {
        el.classList.remove('pdf-text-pass')
      })

      const box = await note.boundingBox()
      if (!box || box.width < 8) throw new Error('note not laid out / off-screen')
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 })
      await expect(note).toHaveAttribute('data-activate-hint-hover', '', { timeout: 5_000 })
      await expectHintVisible(note.locator('[data-embed-activate-hint]'))
      const pillBox = await pill.boundingBox()
      if (!pillBox) throw new Error('hint pill not laid out')
      return pillBox.width
    }

    const widthAtZoom1 = await hoverNoteAndMeasure()
    expect(widthAtZoom1).toBeGreaterThan(40)

    // Re-open at zoom 2 (same elements, near-origin note stays on-screen with scroll 0).
    await leaveToHome(page)
    await seedSession(appDataDir, pdfId, {
      version: 1,
      docId: pdfId,
      updatedAt: new Date().toISOString(),
      camera: { scrollX: 0, scrollY: 0, zoom: 2 },
      elements: [noteEl]
    })
    await openPdf(page, categoryId, pdfId)
    await closePdfSidebar(page)
    await expect(note).toBeVisible({ timeout: 30_000 })

    const canvasZoom = await page.locator('[data-pdf-canvas-root]').evaluate((el) =>
      parseFloat(getComputedStyle(el).getPropertyValue('--canvas-zoom') || '1')
    )
    expect(canvasZoom).toBeGreaterThanOrEqual(1.9)

    const widthAfterZoom = await hoverNoteAndMeasure()
    // Counter-scale keeps screen size flat; without it width would track zoom (~2×).
    expect(Math.abs(widthAfterZoom - widthAtZoom1) / widthAtZoom1).toBeLessThan(0.15)
  } finally {
    await close()
  }
})

test('search browse chip screen size stays stable across zoom', async () => {
  test.setTimeout(90_000)
  const appDataDir = await tmpAppData('libritus-e2e-browse-chip-zoom-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })
  const capX = 80
  const capY = 40
  const capW = 300
  const capH = 300
  const fileId = 'browse-chip-zoom-att'
  await seedAttachmentPng(appDataDir, fileId)

  await seedSession(appDataDir, pdfId, {
    version: 1,
    docId: pdfId,
    updatedAt: new Date().toISOString(),
    camera: { scrollX: 0, scrollY: 0, zoom: 1 },
    elements: [
      seedSearchCaptureElement({
        id: 'cap-chip-zoom',
        x: capX,
        y: capY,
        width: capW,
        height: capH,
        query: 'chip zoom',
        url: 'https://example.com',
        fileId,
        capturedAt: '2026-01-01T00:00:00.000Z'
      })
    ]
  })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)
    await closePdfSidebar(page)
    await page.getByLabel('Current page').waitFor({ state: 'visible' })

    const chip = page.locator('[data-search-browse-hint]')

    // Edge-select so the chip stays visible across zoom (no scene-coord hover after zoom).
    await clickScene(page, capX + 4, capY + 60)
    await expect(chip).toBeVisible({ timeout: 5_000 })
    const box1 = await chip.boundingBox()
    if (!box1) throw new Error('browse chip not laid out')
    const widthAtZoom1 = box1.width
    expect(widthAtZoom1).toBeGreaterThan(40)

    const pageEl = page.locator('[data-pdf-page="0"]')
    await pageEl.waitFor({ state: 'visible', timeout: 60_000 })
    const pageBox = await pageEl.boundingBox()
    if (!pageBox) throw new Error('pdf page has no box')
    await page.mouse.move(pageBox.x + pageBox.width / 2, pageBox.y + pageBox.height * 0.12)
    await page.keyboard.down('Meta')
    for (let i = 0; i < 15; i++) {
      await page.mouse.wheel(0, -100)
    }
    await page.keyboard.up('Meta')
    await page.waitForTimeout(300)

    // Host HUD is already screen-constant; assert it stays flat after a real zoom jump.
    await expect(chip).toBeVisible({ timeout: 5_000 })
    const box2 = await chip.boundingBox()
    if (!box2) throw new Error('browse chip not laid out after zoom')
    expect(Math.abs(box2.width - widthAtZoom1) / widthAtZoom1).toBeLessThan(0.15)
  } finally {
    await close()
  }
})

test('promoted search image: browse chip on select, hide on deselect/browse', async () => {
  test.setTimeout(90_000)
  const appDataDir = await tmpAppData('libritus-e2e-browse-chip-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })
  const capX = 80
  const capY = 40
  const capW = 300
  const capH = 300
  const fileId = 'browse-chip-att'
  await seedAttachmentPng(appDataDir, fileId)

  await seedSession(appDataDir, pdfId, {
    version: 1,
    docId: pdfId,
    updatedAt: new Date().toISOString(),
    camera: { scrollX: 0, scrollY: 0, zoom: 1 },
    elements: [
      seedNoteElement({ id: 'chip-note', x: 450, y: 40, text: 'neighbor note' }),
      seedSearchCaptureElement({
        id: 'cap-chip',
        x: capX,
        y: capY,
        width: capW,
        height: capH,
        query: 'chip',
        url: 'https://example.com',
        fileId,
        capturedAt: '2026-01-01T00:00:00.000Z'
      })
    ]
  })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)
    await closePdfSidebar(page)
    await page.getByLabel('Current page').waitFor({ state: 'visible' })

    const chip = page.locator('[data-search-browse-hint]')
    await expect(chip).toBeHidden()

    // Hover reading-mode image (no selection) → centered browse chip
    await moveScene(page, capX + capW / 2, capY + capH / 2)
    await expect(chip).toBeVisible({ timeout: 5_000 })
    await expect(chip.getByText('Click to browse')).toBeVisible()

    await moveScene(page, 500, 500)
    await expect(chip).toBeHidden({ timeout: 5_000 })

    // Edge select promoted image → chip
    await clickScene(page, capX + 4, capY + 60)
    await expect(chip).toBeVisible({ timeout: 5_000 })
    await expect(chip.getByText('Click to browse')).toBeVisible()

    // Deselect while pointer ends over a note center (hover early-return path).
    await clickScene(page, 500, 400)
    await moveScene(page, 450 + 160, 40 + 120)
    await expect(chip).toBeHidden({ timeout: 5_000 })

    // Select again, then center-click activates browse (chip must not block) and hides.
    await clickScene(page, capX + 4, capY + 60)
    await expect(chip).toBeVisible({ timeout: 5_000 })
    await clickScene(page, capX + capW / 2, capY + capH / 2)
    await expect
      .poll(
        async () => {
          const result = await page.evaluate(() =>
            (window as any).electron.ipcRenderer.invoke('browser:isVisible')
          )
          return result?.visible === true
        },
        { timeout: 15_000 }
      )
      .toBe(true)
  } finally {
    await close()
  }
})
