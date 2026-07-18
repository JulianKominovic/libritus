import { test, expect } from '@playwright/test'
import { launchApp } from './helpers/launch'
import { clickScene, leaveToHome, tmpAppData, waitForSession, excalidrawCanvas } from './helpers/canvas'
import {
  openPdf,
  readSessionFile,
  seedHighlightElement,
  seedLibrary,
  seedNoteElement,
  seedSession
} from './helpers/seed'

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

    // Double-click existing note → edit → Escape
    const noteText = page.getByText('editable note').first()
    const box = await noteText.boundingBox()
    if (!box) throw new Error('note text not laid out')
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2)
    await expect(page.locator('[contenteditable="true"]')).toHaveCount(1, { timeout: 5_000 })
    await page.keyboard.press('Escape')
    await expect(page.locator('[contenteditable="true"]')).toHaveCount(0, { timeout: 5_000 })
  } finally {
    await close()
  }
})

test('drag note by center moves it (solid fill hit-test)', async () => {
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

    // Center of note in scene ≈ canvas origin + note center (scroll 0, zoom 1)
    const startX = cbox.x + noteX + 140
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
    ) as { id: string }

    expect(arrow.elbowed).toBe(true)
    expect(arrow.startBinding).toBeFalsy()
    expect(arrow.endBinding?.elementId).toBe(note.id)
  } finally {
    await close()
  }
})
