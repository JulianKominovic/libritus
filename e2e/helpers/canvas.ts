import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Page } from 'playwright'
import { expect } from '@playwright/test'
import type { SessionSnapshot } from '../../src/renderer/src/lib/pdf-canvas/sessionTypes'

export async function expectUnsaved(page: Page): Promise<void> {
  await expect(page.getByText('Unsaved')).toBeVisible({ timeout: 10_000 })
}

export async function expectSaved(page: Page): Promise<void> {
  // Save chip is hidden while saved; wait until Unsaved is gone.
  await expect(page.getByText('Unsaved')).toBeHidden({ timeout: 15_000 })
}

/** PDF sidebar overlays the center toolbar on purpose — close it before toolbar clicks. */
export async function closePdfSidebar(page: Page): Promise<void> {
  const toggle = page.getByRole('button', { name: 'Toggle PDF sidebar' })
  if ((await toggle.getAttribute('aria-pressed')) === 'true') {
    await toggle.click()
  }
  await expect(page.getByLabel(/Document outline/)).toBeHidden({ timeout: 5_000 })
}

/** Click Home breadcrumb (triggers flushActiveSession before navigate). */
export async function leaveToHome(page: Page): Promise<void> {
  const home = page.getByRole('link', { name: 'Home' }).first()
  await home.click()
  await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
    timeout: 30_000
  })
}

/** Poll until session file exists and predicate passes (or timeout). */
export async function waitForSession(
  read: () => Promise<SessionSnapshot | null>,
  predicate: (snap: SessionSnapshot) => boolean,
  timeoutMs = 15_000
): Promise<SessionSnapshot> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const snap = await read()
    if (snap && predicate(snap)) return snap
    await new Promise((r) => setTimeout(r, 200))
  }
  const last = await read()
  throw new Error(
    `waitForSession timed out. last=${last ? JSON.stringify(last).slice(0, 400) : 'null'}`
  )
}

export async function excalidrawCanvas(page: Page) {
  const canvas = page.locator('.excalidraw__canvas.interactive').first()
  await canvas.waitFor({ state: 'visible', timeout: 60_000 })
  return canvas
}

/**
 * Arm `.pdf-text-pass` by re-moving over a PDF page each poll tick.
 * A one-shot mouse.move before Excalidraw API/tool is ready leaves pass off forever.
 */
export async function expectPdfTextPass(
  page: Page,
  opts?: { pageIndex?: number; timeout?: number }
): Promise<void> {
  const pageIndex = opts?.pageIndex ?? 0
  const pageEl = page.locator(`[data-pdf-page="${pageIndex}"]`)
  await pageEl.waitFor({ state: 'visible', timeout: 60_000 })
  await expect
    .poll(
      async () => {
        const box = await pageEl.boundingBox()
        if (!box) return false
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        return page.evaluate(() =>
          document.querySelector('[data-pdf-canvas-root]')?.classList.contains('pdf-text-pass')
        )
      },
      { timeout: opts?.timeout ?? 10_000 }
    )
    .toBe(true)
}

/**
 * Drag-select PDF text via EmbedPDF SelectionLayer (no DOM `.textLayer`).
 * Defaults aim at sample.pdf title: "Libritus e2e sample" at PDF (50, 700).
 * xStartRatio 0.08 ≈ left edge of the glyph (50/612); 0.05 is empty margin (no hit);
 * 0.15 cut mid-word ("itus e2e sample").
 */
export async function dragSelectPdfPage(
  page: Page,
  opts?: {
    pageIndex?: number
    yRatio?: number
    xStartRatio?: number
    xEndRatio?: number
  }
): Promise<void> {
  const pageIndex = opts?.pageIndex ?? 0
  const pageEl = page.locator(`[data-pdf-page="${pageIndex}"]`)
  await pageEl.waitFor({ state: 'visible', timeout: 60_000 })
  const box = await pageEl.boundingBox()
  if (!box) throw new Error(`pdf page ${pageIndex} has no box`)
  const y = box.y + box.height * (opts?.yRatio ?? 0.12)
  const x0 = box.x + box.width * (opts?.xStartRatio ?? 0.08)
  const x1 = box.x + box.width * (opts?.xEndRatio ?? 0.55)
  // Hover first so the host enables `.pdf-text-pass` before pointerdown.
  await page.mouse.move(x0, y)
  await page.mouse.down()
  await page.mouse.move(x1, y, { steps: 8 })
  await page.mouse.up()
}

/** Click scene-ish point assuming restored camera scroll≈0 zoom≈1. */
export async function clickScene(page: Page, sceneX: number, sceneY: number): Promise<void> {
  const canvas = await excalidrawCanvas(page)
  const box = await canvas.boundingBox()
  if (!box) throw new Error('no canvas box')
  await page.mouse.click(box.x + sceneX, box.y + sceneY)
}

export function tmpAppData(prefix: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), prefix))
}
