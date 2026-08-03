import { test, expect } from '@playwright/test'
import path from 'node:path'
import { launchApp } from './helpers/launch'
import {
  clickScene,
  closePdfSidebar,
  leaveToHome,
  tmpAppData,
  waitForSession,
  excalidrawCanvas,
  expectUnsaved,
  dragSelectPdfPage
} from './helpers/canvas'
import {
  openPdf,
  readSessionFile,
  seedHighlightElement,
  seedLibrary,
  seedNoteElement,
  seedSession
} from './helpers/seed'

test('text select shows toolbar; color click creates locked pdfHighlight', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-hl-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)
    await closePdfSidebar(page)

    await expect(page.getByRole('button', { name: 'Select text' })).toHaveCount(0)

    await dragSelectPdfPage(page)

    // Pending: colors + Add note / Buscar / Copiar — no Remove / Unsaved yet.
    const colorBtn = page.getByRole('button', { name: 'Highlight color fuchsia' })
    await expect(colorBtn).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add note' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Copiar' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Remove' })).toHaveCount(0)

    await colorBtn.click()
    await expectUnsaved(page)
    await expect(page.getByRole('button', { name: 'Remove' })).toBeVisible()

    await leaveToHome(page)

    const snap = await waitForSession(
      () => readSessionFile(appDataDir, pdfId),
      (s) =>
        (s.elements ?? []).some(
          (el) =>
            el &&
            typeof el === 'object' &&
            (el as { customData?: { pdfHighlight?: boolean }; locked?: boolean }).customData
              ?.pdfHighlight === true &&
            (el as { locked?: boolean }).locked === true
        )
    )
    expect(snap.elements?.length).toBeGreaterThan(0)
  } finally {
    await close()
  }
})

test('text select at zoom ≠ 1 creates locked highlight near text', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-hl-zoom-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)
    await closePdfSidebar(page)

    const pageEl = page.locator('[data-pdf-page="0"]')
    await pageEl.waitFor({ state: 'visible', timeout: 60_000 })
    const preBox = await pageEl.boundingBox()
    if (!preBox) throw new Error('pdf page has no box')

    // Wheel zoom over page (host handler while `.pdf-text-pass`)
    await page.mouse.move(preBox.x + preBox.width / 2, preBox.y + preBox.height * 0.12)
    await page.keyboard.down('Meta')
    await page.mouse.wheel(0, -400)
    await page.keyboard.up('Meta')
    await page.waitForTimeout(300)

    await dragSelectPdfPage(page)

    const colorBtn = page.getByRole('button', { name: 'Highlight color fuchsia' })
    await expect(colorBtn).toBeVisible()
    await colorBtn.click()

    await expect(page.getByRole('button', { name: 'Add note' })).toBeVisible()
    await expectUnsaved(page)
    await leaveToHome(page)

    const snap = await waitForSession(
      () => readSessionFile(appDataDir, pdfId),
      (s) =>
        (s.elements ?? []).some(
          (el) =>
            (el as { customData?: { pdfHighlight?: boolean } }).customData?.pdfHighlight === true
        )
    )
    const hl = (snap.elements ?? []).find(
      (el) => (el as { customData?: { pdfHighlight?: boolean } }).customData?.pdfHighlight === true
    ) as { x: number; y: number; width: number; height: number }
    expect(hl.width).toBeGreaterThan(5)
    expect(hl.height).toBeGreaterThan(2)
    // Title band (~yRatio 0.12 on Letter). Without undoing CSS zoom in
    // convertEventToPoint, hit-test maps ~zoom× too far down (y ≫ 180).
    expect(hl.y).toBeGreaterThan(10)
    expect(hl.y).toBeLessThan(180)
    expect(hl.height).toBeLessThan(80)
  } finally {
    await close()
  }
})

test('Remove from highlight toolbar deletes highlight on flush', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-hl-remove-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })
  const hlX = 80
  const hlY = 120

  await seedSession(appDataDir, pdfId, {
    version: 1,
    docId: pdfId,
    updatedAt: new Date().toISOString(),
    camera: { scrollX: 0, scrollY: 0, zoom: 1 },
    elements: [seedHighlightElement({ id: 'hl-remove', x: hlX, y: hlY, text: 'gone' })]
  })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)

    await clickScene(page, hlX + 40, hlY + 9)
    await page.getByRole('button', { name: 'Remove' }).click({ timeout: 10_000 })
    await expectUnsaved(page)

    await leaveToHome(page)

    const snap = await waitForSession(
      () => readSessionFile(appDataDir, pdfId),
      (s) =>
        !(s.elements ?? []).some(
          (el) =>
            el &&
            typeof el === 'object' &&
            (el as { id?: string; customData?: { pdfHighlight?: boolean } }).id === 'hl-remove' &&
            (el as { customData?: { pdfHighlight?: boolean } }).customData?.pdfHighlight === true
        )
    )
    expect(
      (snap.elements ?? []).some(
        (el) =>
          (el as { customData?: { pdfHighlight?: boolean } }).customData?.pdfHighlight === true
      )
    ).toBe(false)
  } finally {
    await close()
  }
})

test('Remove deletes all rects that share a highlight groupId', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-hl-group-remove-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })
  const groupId = 'hl-group-1'
  const hlX = 80
  const hlY = 120

  await seedSession(appDataDir, pdfId, {
    version: 1,
    docId: pdfId,
    updatedAt: new Date().toISOString(),
    camera: { scrollX: 0, scrollY: 0, zoom: 1 },
    elements: [
      seedHighlightElement({
        id: 'hl-g-a',
        x: hlX,
        y: hlY,
        text: 'grouped',
        groupId
      }),
      seedHighlightElement({
        id: 'hl-g-b',
        x: hlX,
        y: hlY + 24,
        text: 'grouped',
        groupId
      })
    ]
  })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)

    await clickScene(page, hlX + 40, hlY + 9)
    await page.getByRole('button', { name: 'Remove' }).click({ timeout: 10_000 })
    await expectUnsaved(page)

    await leaveToHome(page)

    const snap = await waitForSession(
      () => readSessionFile(appDataDir, pdfId),
      (s) => {
        const live = (s.elements ?? []).filter(
          (el) =>
            el &&
            typeof el === 'object' &&
            (el as { isDeleted?: boolean }).isDeleted !== true &&
            (el as { customData?: { pdfHighlight?: boolean } }).customData?.pdfHighlight === true
        )
        return live.length === 0
      }
    )

    const liveIds = (snap.elements ?? [])
      .filter(
        (el) =>
          el &&
          typeof el === 'object' &&
          (el as { isDeleted?: boolean }).isDeleted !== true &&
          (el as { customData?: { pdfHighlight?: boolean } }).customData?.pdfHighlight === true
      )
      .map((el) => (el as { id?: string }).id)
    expect(liveIds).toEqual([])
  } finally {
    await close()
  }
})

test('Add note from grouped highlight uses groupId as sourceHighlightId', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-hl-group-note-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })
  const groupId = 'hl-group-note'
  const hlX = 80
  const hlY = 120

  await seedSession(appDataDir, pdfId, {
    version: 1,
    docId: pdfId,
    updatedAt: new Date().toISOString(),
    camera: { scrollX: 0, scrollY: 0, zoom: 1 },
    elements: [
      seedHighlightElement({
        id: 'hl-note-a',
        x: hlX,
        y: hlY,
        text: 'quoted',
        groupId
      }),
      seedHighlightElement({
        id: 'hl-note-b',
        x: hlX,
        y: hlY + 24,
        text: 'quoted',
        groupId
      })
    ]
  })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)

    await clickScene(page, hlX + 40, hlY + 9)
    await page.getByRole('button', { name: 'Add note' }).click({ timeout: 10_000 })
    await expectUnsaved(page)

    await leaveToHome(page)

    const snap = await waitForSession(
      () => readSessionFile(appDataDir, pdfId),
      (s) =>
        (s.elements ?? []).some(
          (el) =>
            (el as { customData?: { pdfNote?: boolean; sourceHighlightId?: string } }).customData
              ?.pdfNote === true &&
            (el as { customData?: { sourceHighlightId?: string } }).customData?.sourceHighlightId ===
              groupId
        )
    )

    const note = (snap.elements ?? []).find(
      (el) =>
        (el as { customData?: { pdfNote?: boolean } }).customData?.pdfNote === true
    ) as { customData?: { sourceHighlightId?: string } }

    expect(note.customData?.sourceHighlightId).toBe(groupId)
    expect(note.customData?.sourceHighlightId).not.toBe('hl-note-a')
  } finally {
    await close()
  }
})

test('Remove highlight also deletes linked notes and arrows', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-hl-cascade-remove-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })
  const hlX = 80
  const hlY = 120
  const noteId = 'linked-note'
  const groupId = 'hl-cascade'

  await seedSession(appDataDir, pdfId, {
    version: 1,
    docId: pdfId,
    updatedAt: new Date().toISOString(),
    camera: { scrollX: 0, scrollY: 0, zoom: 1 },
    elements: [
      seedHighlightElement({
        id: 'hl-cascade',
        x: hlX,
        y: hlY,
        text: 'quoted',
        groupId
      }),
      {
        ...seedNoteElement({ id: noteId, x: hlX + 180, y: hlY - 100, text: 'linked' }),
        customData: {
          pdfNote: true,
          sourceHighlightId: groupId,
          plateValue: [{ type: 'p', children: [{ text: 'linked' }] }]
        }
      },
      {
        id: 'linked-arrow',
        type: 'arrow',
        x: hlX + 120,
        y: hlY + 9,
        width: 60,
        height: 0,
        angle: 0,
        strokeColor: '#495057',
        backgroundColor: 'transparent',
        fillStyle: 'solid',
        strokeWidth: 1,
        strokeStyle: 'solid',
        roughness: 0,
        opacity: 100,
        groupIds: [],
        frameId: null,
        index: 'a2',
        roundness: null,
        seed: 3,
        version: 1,
        versionNonce: 3,
        isDeleted: false,
        boundElements: null,
        updated: 1,
        link: null,
        locked: true,
        startBinding: null,
        endBinding: null,
        points: [
          [0, 0],
          [60, 0]
        ],
        customData: {
          pdfNoteArrow: true,
          noteId,
          side: 'right',
          startX: hlX + 120,
          startY: hlY + 9
        }
      },
      seedNoteElement({ id: 'place-keep', x: 400, y: 300, text: 'keep me' })
    ]
  })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)

    await clickScene(page, hlX + 40, hlY + 9)
    await page.getByRole('button', { name: 'Remove' }).click({ timeout: 10_000 })
    await expectUnsaved(page)

    await leaveToHome(page)

    const snap = await waitForSession(
      () => readSessionFile(appDataDir, pdfId),
      (s) => {
        const live = (s.elements ?? []).filter(
          (el) =>
            el &&
            typeof el === 'object' &&
            (el as { isDeleted?: boolean }).isDeleted !== true
        )
        const hasHl = live.some(
          (el) =>
            (el as { customData?: { pdfHighlight?: boolean } }).customData?.pdfHighlight === true
        )
        const hasLinkedNote = live.some((el) => (el as { id?: string }).id === noteId)
        const hasArrow = live.some(
          (el) =>
            (el as { customData?: { pdfNoteArrow?: boolean } }).customData?.pdfNoteArrow === true
        )
        return !hasHl && !hasLinkedNote && !hasArrow
      }
    )

    const live = (snap.elements ?? []).filter(
      (el) =>
        el && typeof el === 'object' && (el as { isDeleted?: boolean }).isDeleted !== true
    )
    expect(
      live.some(
        (el) =>
          (el as { customData?: { pdfHighlight?: boolean } }).customData?.pdfHighlight === true
      )
    ).toBe(false)
    expect(
      live.some(
        (el) =>
          (el as { customData?: { pdfNoteArrow?: boolean } }).customData?.pdfNoteArrow === true
      )
    ).toBe(false)
    expect(live.some((el) => (el as { id?: string }).id === noteId)).toBe(false)
    expect(live.some((el) => (el as { id?: string }).id === 'place-keep')).toBe(true)
  } finally {
    await close()
  }
})

test('leave with Unsaved writes session via flush', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-flush-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })

  await seedSession(appDataDir, pdfId, {
    version: 1,
    docId: pdfId,
    updatedAt: new Date().toISOString(),
    camera: { scrollX: 0, scrollY: 0, zoom: 1 },
    elements: [seedNoteElement({ id: 'n1', text: 'before leave' })]
  })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)
    await expect(page.getByText('before leave')).toBeVisible({ timeout: 30_000 })
    await closePdfSidebar(page)

    await page.getByRole('button', { name: 'Place note' }).click()
    const canvas = await excalidrawCanvas(page)
    const cbox = await canvas.boundingBox()
    if (!cbox) throw new Error('no canvas')
    await page.mouse.click(cbox.x + 300, cbox.y + 300)
    await expectUnsaved(page)

    await leaveToHome(page)

    const snap = await waitForSession(
      () => readSessionFile(appDataDir, pdfId),
      (s) => {
        const notes = (s.elements ?? []).filter(
          (el) => (el as { customData?: { pdfNote?: boolean } }).customData?.pdfNote === true
        )
        return notes.length >= 2
      }
    )
    expect(snap.version).toBe(2)
    expect(snap.docId).toBe(pdfId)
  } finally {
    await close()
  }
})

test('clearing selection hides pending highlight toolbar', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-hl-clear-sel-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)
    await closePdfSidebar(page)

    await dragSelectPdfPage(page)

    await expect(page.getByRole('button', { name: 'Add note' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Copiar' })).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Add note' })).toBeHidden({ timeout: 5_000 })
  } finally {
    await close()
  }
})

test('click outside highlight hides toolbar under text pass-through', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-hl-outside-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })
  const hlX = 80
  const hlY = 120

  await seedSession(appDataDir, pdfId, {
    version: 1,
    docId: pdfId,
    updatedAt: new Date().toISOString(),
    camera: { scrollX: 0, scrollY: 0, zoom: 1 },
    elements: [seedHighlightElement({ id: 'hl-out', x: hlX, y: hlY, text: 'out' })]
  })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)
    await closePdfSidebar(page)

    await clickScene(page, hlX + 40, hlY + 9)
    await expect(page.getByRole('button', { name: 'Remove' })).toBeVisible({ timeout: 10_000 })

    // Empty scene area (no highlight) — host must dismiss even with pdf-text-pass.
    await clickScene(page, 400, 400)
    await expect(page.getByRole('button', { name: 'Remove' })).toBeHidden({ timeout: 5_000 })
  } finally {
    await close()
  }
})

test('click outside pending toolbar dismisses without revive on mouseup', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-hl-pending-out-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)
    await closePdfSidebar(page)

    await dragSelectPdfPage(page)

    await expect(page.getByRole('button', { name: 'Copiar' })).toBeVisible()

    // Outside click must clear selection so mouseup cannot revive pending toolbar.
    await clickScene(page, 400, 400)
    await expect(page.getByRole('button', { name: 'Add note' })).toBeHidden({ timeout: 5_000 })
  } finally {
    await close()
  }
})

test('Cmd/Ctrl+A clears PDF text selection (Excalidraw select-all wins)', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-hl-cmd-a-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)
    await closePdfSidebar(page)

    await dragSelectPdfPage(page)
    await expect(page.getByRole('button', { name: 'Add note' })).toBeVisible()

    await page.locator('[data-pdf-canvas-root]').focus()
    await page.keyboard.press('ControlOrMeta+A')

    await expect(page.getByRole('button', { name: 'Add note' })).toBeHidden({ timeout: 5_000 })
  } finally {
    await close()
  }
})

test('Cmd/Ctrl+Z undoes highlight without re-clicking the canvas', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-hl-undo-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)
    await closePdfSidebar(page)

    await dragSelectPdfPage(page)

    const colorBtn = page.getByRole('button', { name: 'Highlight color fuchsia' })
    await expect(colorBtn).toBeVisible()
    await colorBtn.click()
    await expect(page.getByRole('button', { name: 'Remove' })).toBeVisible()
    await expectUnsaved(page)

    // Prefer keyboard path (Excalidraw handleKeyboardGlobally). Fallback: undo toolbar.
    await page.locator('[data-pdf-canvas-root]').focus()
    await page.keyboard.press('ControlOrMeta+Z')
    await expect(page.getByRole('button', { name: 'Remove' })).toBeHidden({ timeout: 5_000 })
  } finally {
    await close()
  }
})

test('pending Add note commits default highlight + note without color click', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-hl-pending-note-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)
    await closePdfSidebar(page)

    await dragSelectPdfPage(page)

    await expect(page.getByRole('button', { name: 'Add note' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Remove' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Add note' }).click()
    await expectUnsaved(page)
    // Committed → Remove available until toolbar hides for note select.
    await leaveToHome(page)

    const snap = await waitForSession(
      () => readSessionFile(appDataDir, pdfId),
      (s) => {
        const els = s.elements ?? []
        const hl = els.some(
          (el) =>
            (el as { customData?: { pdfHighlight?: boolean } }).customData?.pdfHighlight === true
        )
        const note = els.some(
          (el) => (el as { customData?: { pdfNote?: boolean } }).customData?.pdfNote === true
        )
        return hl && note
      }
    )
    const highlight = (snap.elements ?? []).find(
      (el) => (el as { customData?: { pdfHighlight?: boolean } }).customData?.pdfHighlight === true
    ) as { backgroundColor?: string; locked?: boolean }
    expect(highlight.locked).toBe(true)
    // Default pending commit uses HIGHLIGHT_FILL (fuchsia).
    expect(highlight.backgroundColor?.toUpperCase()).toBe('#FF00FF')
  } finally {
    await close()
  }
})

test('pending Copiar writes selection text and does not dirty session', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-hl-pending-copy-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)
    await closePdfSidebar(page)

    await page.evaluate(() => {
      ;(window as unknown as { __copied: string | null }).__copied = null
      void navigator.clipboard.writeText('')
      navigator.clipboard.writeText = async (text: string) => {
        ;(window as unknown as { __copied: string | null }).__copied = text
      }
    })

    await dragSelectPdfPage(page)

    await expect(page.getByRole('button', { name: 'Copiar' })).toBeVisible()
    await page.getByRole('button', { name: 'Copiar' }).click()

    await expect(page.getByRole('button', { name: 'Copiar' })).toBeHidden({ timeout: 5_000 })
    await expect(page.getByText('Unsaved')).toBeHidden()

    const copied = await page.evaluate(
      () => (window as unknown as { __copied: string | null }).__copied
    )
    expect(copied).toMatch(/Libritus e2e sample/)
  } finally {
    await close()
  }
})

test('zoomed-out line selection does not create page-tall highlights', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-hl-zoom-out-line-')
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
    await closePdfSidebar(page)

    // Zoom out so both pages stay visible (regression: line select must stay line-tall).
    const root = page.locator('[data-pdf-canvas-root]')
    const rootBox = await root.boundingBox()
    if (!rootBox) throw new Error('no canvas root')
    await page.mouse.move(rootBox.x + rootBox.width / 2, rootBox.y + rootBox.height / 2)
    await page.keyboard.down('Meta')
    await page.mouse.wheel(0, 1200)
    await page.keyboard.up('Meta')
    await expect(page.locator('[data-pdf-page="0"]')).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('[data-pdf-page="1"]')).toBeVisible({ timeout: 60_000 })

    // EmbedPDF selection is per-page — drag a line on page 0 (not cross-page).
    // sample-2p: "Libritus page one" at PDF (72, 720) → ~x 0.12, y from top ~0.09.
    await dragSelectPdfPage(page, {
      pageIndex: 0,
      xStartRatio: 0.11,
      xEndRatio: 0.55,
      yRatio: 0.09
    })

    const colorBtn = page.getByRole('button', { name: 'Highlight color fuchsia' })
    await expect(colorBtn).toBeVisible({ timeout: 10_000 })
    await colorBtn.click()
    await expectUnsaved(page)
    await leaveToHome(page)

    const snap = await waitForSession(
      () => readSessionFile(appDataDir, pdfId),
      (s) =>
        (s.elements ?? []).some(
          (el) =>
            (el as { customData?: { pdfHighlight?: boolean } }).customData?.pdfHighlight === true
        )
    )
    const heights = (snap.elements ?? [])
      .filter(
        (el) =>
          (el as { customData?: { pdfHighlight?: boolean } }).customData?.pdfHighlight === true
      )
      .map((el) => (el as { height?: number }).height ?? 0)
    expect(heights.length).toBeGreaterThan(0)
    // Page MediaBox height is 792; line boxes must stay far below that.
    expect(Math.max(...heights)).toBeLessThan(120)
  } finally {
    await close()
  }
})
