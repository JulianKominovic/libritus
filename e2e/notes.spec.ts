import { test, expect } from '@playwright/test'
import { launchApp } from './helpers/launch'
import { clickScene, leaveToHome, tmpAppData, waitForSession, excalidrawCanvas, expectUnsaved } from './helpers/canvas'
import {
  openPdf,
  readSessionFile,
  seedHighlightElement,
  seedLibrary,
  seedNoteElement,
  seedSession
} from './helpers/seed'

/** Activate Excalidraw embed: click the note card center (middle third), not just the text. */
async function activateNoteEmbed(
  page: import('@playwright/test').Page,
  text: string
): Promise<void> {
  const note = page.locator('[data-pdf-note]').filter({ hasText: text }).first()
  await expect(note).toBeVisible({ timeout: 30_000 })
  const box = await note.boundingBox()
  if (!box) throw new Error('note card not laid out')
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.click(cx, cy)
  await expect(page.locator('[contenteditable="true"]')).toHaveCount(1, { timeout: 5_000 })
}

test('place note selects without entering edit; Escape leaves edit', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-notes-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })

  await seedSession(appDataDir, pdfId, {
    version: 1,
    docId: pdfId,
    updatedAt: new Date().toISOString(),
    camera: { scrollX: 0, scrollY: 0, zoom: 1 },
    elements: [seedNoteElement({ id: 'edit-note', x: 200, y: 150, text: 'editable note' })]
  })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)
    await expect(page.getByText('editable note')).toBeVisible({ timeout: 30_000 })

    // Place note → create → must NOT enter edit (no contenteditable focused)
    await page.getByRole('button', { name: 'Place note' }).click()
    await clickScene(page, 450, 400)
    await expect(page.getByText('Unsaved')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[contenteditable="true"]')).toHaveCount(0)

    // Click center → activate embed → Escape leaves edit
    await activateNoteEmbed(page, 'editable note')
    await page.keyboard.press('Escape')
    await expect(page.locator('[contenteditable="true"]')).toHaveCount(0, { timeout: 5_000 })
  } finally {
    await close()
  }
})

test('drag note by edge moves it (center click activates embed)', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-drag-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })
  const noteX = 200
  const noteY = 150

  await seedSession(appDataDir, pdfId, {
    version: 1,
    docId: pdfId,
    updatedAt: new Date().toISOString(),
    camera: { scrollX: 0, scrollY: 0, zoom: 1 },
    elements: [seedNoteElement({ id: 'drag-note', x: noteX, y: noteY, text: 'drag me' })]
  })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)
    await expect(page.getByText('drag me')).toBeVisible({ timeout: 30_000 })

    const canvas = await excalidrawCanvas(page)
    const cbox = await canvas.boundingBox()
    if (!cbox) throw new Error('no canvas')

    // Near left edge — center would activate the embed instead of drag.
    const startX = cbox.x + noteX + 8
    const startY = cbox.y + noteY + 100
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + 80, startY + 40, { steps: 8 })
    await page.mouse.up()

    await expect(page.getByText('Unsaved')).toBeVisible({ timeout: 10_000 })
    await leaveToHome(page)

    const snap = await waitForSession(
      () => readSessionFile(appDataDir, pdfId),
      (s) => {
        const note = (s.elements ?? []).find(
          (el) =>
            el &&
            typeof el === 'object' &&
            (el as { id?: string }).id === 'drag-note'
        ) as { x?: number; y?: number } | undefined
        return note != null && (note.x !== noteX || note.y !== noteY)
      }
    )
    const note = (snap.elements ?? []).find(
      (el) => (el as { id?: string }).id === 'drag-note'
    ) as { x: number; y: number }
    expect(Math.abs(note.x - noteX) + Math.abs(note.y - noteY)).toBeGreaterThan(20)
  } finally {
    await close()
  }
})

test('Add note from highlight writes elbow arrow unbound at start', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-addnote-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })
  const hlX = 80
  const hlY = 120

  await seedSession(appDataDir, pdfId, {
    version: 1,
    docId: pdfId,
    updatedAt: new Date().toISOString(),
    camera: { scrollX: 0, scrollY: 0, zoom: 1 },
    elements: [seedHighlightElement({ id: 'hl-1', x: hlX, y: hlY, text: 'quoted' })]
  })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)

    await clickScene(page, hlX + 40, hlY + 9)
    await page.getByRole('button', { name: 'Add note' }).click({ timeout: 10_000 })
    await expect(page.getByText('Unsaved')).toBeVisible({ timeout: 10_000 })

    await leaveToHome(page)

    const snap = await waitForSession(
      () => readSessionFile(appDataDir, pdfId),
      (s) => (s.elements ?? []).some((el) => (el as { type?: string }).type === 'arrow')
    )

    const arrow = (snap.elements ?? []).find(
      (el) => (el as { type?: string }).type === 'arrow'
    ) as {
      elbowed?: boolean
      startBinding?: unknown
      endBinding?: { elementId?: string }
    }
    const note = (snap.elements ?? []).find(
      (el) =>
        el &&
        typeof el === 'object' &&
        (el as { customData?: { pdfNote?: boolean } }).customData?.pdfNote === true
    ) as { id: string; type?: string; link?: string }

    expect(note.type).toBe('embeddable')
    expect(note.link).toBe('libritus://pdf-note')
    expect(arrow.elbowed).toBe(true)
    expect(arrow.startBinding).toBeFalsy()
    expect(arrow.endBinding?.elementId).toBe(note.id)
  } finally {
    await close()
  }
})

test('edit note persists plateValue in session after flush', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-plate-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })
  const unique = `plate-persist-${Date.now()}`

  await seedSession(appDataDir, pdfId, {
    version: 1,
    docId: pdfId,
    updatedAt: new Date().toISOString(),
    camera: { scrollX: 0, scrollY: 0, zoom: 1 },
    elements: [seedNoteElement({ id: 'edit-persist', x: 200, y: 150, text: 'before edit' })]
  })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)
    await expect(page.getByText('before edit')).toBeVisible({ timeout: 30_000 })

    await activateNoteEmbed(page, 'before edit')
    // Embed activate + Plate focus settle before typing
    await page.waitForTimeout(400)

    const editable = page.locator('[contenteditable="true"]').first()
    await editable.click()
    await page.keyboard.press('ControlOrMeta+A')
    await editable.pressSequentially(unique, { delay: 20 })
    await expect(editable).toContainText(unique, { timeout: 5_000 })

    await page.keyboard.press('Escape')
    await expect(page.locator('[contenteditable="true"]')).toHaveCount(0, { timeout: 5_000 })
    await expectUnsaved(page)

    await leaveToHome(page)

    const snap = await waitForSession(
      () => readSessionFile(appDataDir, pdfId),
      (s) => JSON.stringify(s.elements ?? []).includes(unique)
    )
    expect(JSON.stringify(snap.elements)).toContain(unique)
  } finally {
    await close()
  }
})

test('note toolbar click keeps edit mode', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-toolbar-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })
  const unique = `fmt-toolbar-${Date.now()}`

  await seedSession(appDataDir, pdfId, {
    version: 1,
    docId: pdfId,
    updatedAt: new Date().toISOString(),
    camera: { scrollX: 0, scrollY: 0, zoom: 1 },
    elements: [seedNoteElement({ id: 'toolbar-note', x: 200, y: 150, text: 'toolbar seed' })]
  })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)
    await expect(page.getByText('toolbar seed')).toBeVisible({ timeout: 30_000 })

    await activateNoteEmbed(page, 'toolbar seed')
    await page.waitForTimeout(400)

    const boldBtn = page.getByTestId('note-toolbar-bold')
    await expect(boldBtn).toBeVisible({ timeout: 5_000 })

    const editable = page.locator('[contenteditable="true"]').first()
    await editable.click()
    await page.keyboard.press('ControlOrMeta+A')
    // Typing triggers updateScene (new note object). Regression: that used to
    // drop embed pointer-events so the next toolbar click exited edit.
    await editable.pressSequentially(unique, { delay: 20 })
    await expect(editable).toContainText(unique, { timeout: 5_000 })
    await page.keyboard.press('ControlOrMeta+A')
    await boldBtn.click()

    await expect(page.locator('[contenteditable="true"]')).toHaveCount(1, { timeout: 2_000 })
    await expect(page.locator('[data-pdf-note][data-editing]')).toHaveCount(1)
    await expect(boldBtn).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.locator('[contenteditable="true"]')).toHaveCount(0, { timeout: 5_000 })
    await expect(page.getByTestId('note-toolbar-bold')).toHaveCount(0)
  } finally {
    await close()
  }
})

test('duplicate note then undo removes the duplicate', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-dup-undo-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })
  const noteX = 200
  const noteY = 150

  await seedSession(appDataDir, pdfId, {
    version: 1,
    docId: pdfId,
    updatedAt: new Date().toISOString(),
    camera: { scrollX: 0, scrollY: 0, zoom: 1 },
    elements: [seedNoteElement({ id: 'dup-src', x: noteX, y: noteY, text: 'dup me' })]
  })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)
    await expect(page.getByText('dup me')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-pdf-note]')).toHaveCount(1)

    // Select via edge click — center would activate the embed instead.
    const canvas = await excalidrawCanvas(page)
    const cbox = await canvas.boundingBox()
    if (!cbox) throw new Error('no canvas')
    await page.mouse.click(cbox.x + noteX + 8, cbox.y + noteY + 100)

    // Cmd+D goes through onDuplicate (same path as paste). Clipboard paste is
    // unreliable in Electron e2e; duplicate exercises the undo-safe fix.
    await page.keyboard.press('ControlOrMeta+D')
    await expect(page.locator('[data-pdf-note]')).toHaveCount(2, { timeout: 10_000 })
    await expectUnsaved(page)

    await page.keyboard.press('ControlOrMeta+Z')
    await expect(page.locator('[data-pdf-note]')).toHaveCount(1, { timeout: 10_000 })
  } finally {
    await close()
  }
})
