import { test, expect } from '@playwright/test'
import { launchApp } from './helpers/launch'
import {
  clickScene,
  closePdfSidebar,
  excalidrawCanvas,
  expectUnsaved,
  leaveToHome,
  tmpAppData,
  waitForSession
} from './helpers/canvas'
import { openPdf, readSessionFile, seedLibrary, seedSession } from './helpers/seed'

/** Scene → client assuming restored camera scroll≈0 zoom≈1. */
async function sceneToClient(
  page: Parameters<typeof clickScene>[0],
  sceneX: number,
  sceneY: number
): Promise<{ x: number; y: number }> {
  const canvas = await excalidrawCanvas(page)
  const box = await canvas.boundingBox()
  if (!box) throw new Error('no canvas box')
  return { x: box.x + sceneX, y: box.y + sceneY }
}

function unlockedArrow(opts: {
  id: string
  x: number
  y: number
  width: number
}): Record<string, unknown> {
  return {
    id: opts.id,
    type: 'arrow',
    x: opts.x,
    y: opts.y,
    width: opts.width,
    height: 0,
    angle: 0,
    strokeColor: '#1e1e1e',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roughness: 0,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: 1,
    version: 1,
    versionNonce: 1,
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
    startBinding: null,
    endBinding: null,
    lastCommittedPoint: null,
    startArrowhead: null,
    endArrowhead: 'arrow',
    points: [
      [0, 0],
      [opts.width, 0]
    ]
  }
}

async function expectPassOff(page: Parameters<typeof clickScene>[0]): Promise<void> {
  await expect
    .poll(
      async () =>
        page.evaluate(() =>
          document.querySelector('[data-pdf-canvas-root]')?.classList.contains('pdf-text-pass')
        ),
      { timeout: 3_000 }
    )
    .toBe(false)
}

function arrowGeometryMoved(el: Record<string, unknown>): boolean {
  const height = typeof el.height === 'number' ? el.height : 0
  if (Math.abs(height) > 10) return true
  const points = el.points
  if (!Array.isArray(points)) return false
  return points.some(
    (p) => Array.isArray(p) && typeof p[1] === 'number' && Math.abs(p[1] as number) > 10
  )
}


/**
 * Regression: while `.pdf-text-pass` is on, a pointerdown on a scene element is
 * still browser-targeted at `.textLayer` (PE clears in the same capture handler).
 * Host must forward that down to the Excalidraw canvas.
 *
 * Important: do NOT mouse.move onto the shape first — that would clear pass
 * before down and miss the race path.
 */
test('pointerdown on shape while pdf-text-pass still on selects', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-pass-race-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })

  await seedSession(appDataDir, pdfId, {
    version: 1,
    docId: pdfId,
    updatedAt: new Date().toISOString(),
    camera: { scrollX: 0, scrollY: 0, zoom: 1 },
    elements: [
      {
        id: 'r1',
        type: 'rectangle',
        x: 500,
        y: 150,
        width: 120,
        height: 80,
        angle: 0,
        strokeColor: '#1e1e1e',
        backgroundColor: '#a5d8ff',
        fillStyle: 'solid',
        strokeWidth: 2,
        strokeStyle: 'solid',
        roughness: 0,
        opacity: 100,
        groupIds: [],
        frameId: null,
        roundness: null,
        seed: 1,
        version: 1,
        versionNonce: 1,
        isDeleted: false,
        boundElements: null,
        updated: 1,
        link: null,
        locked: false
      }
    ]
  })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)
    await closePdfSidebar(page)

    const span = page.locator('.textLayer span').first()
    await span.waitFor({ state: 'visible', timeout: 60_000 })
    const sb = await span.boundingBox()
    const canvas = page.locator('.excalidraw__canvas.interactive').first()
    const cb = await canvas.boundingBox()
    if (!sb || !cb) throw new Error('missing boxes')

    // Arm pass-through on PDF text; stay there (do not move onto the rect).
    await page.mouse.move(sb.x + 4, sb.y + 4)
    await expect
      .poll(
        async () =>
          page.evaluate(() =>
            document.querySelector('[data-pdf-canvas-root]')?.classList.contains('pdf-text-pass')
          ),
        { timeout: 3_000 }
      )
      .toBe(true)

    const rx = cb.x + 560
    const ry = cb.y + 190

    // Dispatch pointerdown at shape coords without a preceding move there, so
    // pass is still on and the hit target under PE-none is the text layer /
    // page stack — host must forward to the canvas.
    const targetedText = await page.evaluate(
      ({ x, y }) => {
        const root = document.querySelector('[data-pdf-canvas-root]')
        if (!root?.classList.contains('pdf-text-pass')) return { ok: false as const, reason: 'pass-off' }
        const hit = document.elementFromPoint(x, y)
        const ev = new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          composed: true,
          clientX: x,
          clientY: y,
          button: 0,
          buttons: 1,
          pointerId: 1,
          pointerType: 'mouse',
          isPrimary: true,
          view: window
        })
        hit?.dispatchEvent(ev)
        return {
          ok: true as const,
          hitCls: (hit as HTMLElement | null)?.className?.toString?.().slice(0, 80) ?? hit?.tagName
        }
      },
      { x: rx, y: ry }
    )
    expect(targetedText.ok).toBe(true)

    await page.mouse.move(rx, ry)
    await page.mouse.up()
    await page.keyboard.press('Backspace')
    await expectUnsaved(page)
  } finally {
    await close()
  }
})

/**
 * Hairline arrows have AABB height≈0; edit chrome sits outside AABB+pad so the
 * pass gate would arm over PDF text and kill Excalidraw handles. Selection must
 * latch pass off — and endpoint drag over text must still transform the arrow.
 */
test('selected arrow endpoint drag over PDF text transforms', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-pass-arrow-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })

  const arrowX = 80
  const arrowY = 160
  const arrowW = 220
  await seedSession(appDataDir, pdfId, {
    version: 1,
    docId: pdfId,
    updatedAt: new Date().toISOString(),
    camera: { scrollX: 0, scrollY: 0, zoom: 1 },
    elements: [unlockedArrow({ id: 'a1', x: arrowX, y: arrowY, width: arrowW })]
  })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)
    await closePdfSidebar(page)

    const span = page.locator('.textLayer span').first()
    await span.waitFor({ state: 'visible', timeout: 60_000 })

    // Select before arming pass (cold click — Excalidraw PE still on).
    await clickScene(page, arrowX + arrowW / 2, arrowY)
    await expect(page.locator('.App-menu__left')).toBeVisible({ timeout: 10_000 })

    const sb = await span.boundingBox()
    if (!sb) throw new Error('missing span box')

    // Outside hairline AABB+pad (~12px) but over PDF text — latch must keep PE.
    await page.mouse.move(sb.x + 4, sb.y + 4)
    await expectPassOff(page)

    // Drag right endpoint down (handle chrome over text). Without the latch,
    // pass would steal this and geometry would not change.
    const end = await sceneToClient(page, arrowX + arrowW, arrowY)
    await page.mouse.move(end.x, end.y)
    await expectPassOff(page)
    await page.mouse.down()
    await page.mouse.move(end.x, end.y + 55, { steps: 8 })
    await page.mouse.up()

    await leaveToHome(page)
    await waitForSession(
      () => readSessionFile(appDataDir, pdfId),
      (s) => {
        const arrow = (s.elements ?? []).find(
          (el) => (el as { id?: string }).id === 'a1' && !(el as { isDeleted?: boolean }).isDeleted
        ) as Record<string, unknown> | undefined
        return arrow != null && arrowGeometryMoved(arrow)
      }
    )
  } finally {
    await close()
  }
})
