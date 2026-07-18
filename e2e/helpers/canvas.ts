import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Page } from 'playwright'
import { expect } from '@playwright/test'

export async function expectUnsaved(page: Page): Promise<void> {
  await expect(page.getByText('Unsaved')).toBeVisible({ timeout: 10_000 })
}

export async function expectSaved(page: Page): Promise<void> {
  await expect(page.getByText('Saved')).toBeVisible({ timeout: 15_000 })
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
  read: () => Promise<{ elements?: unknown[] } | null>,
  predicate: (snap: { elements?: unknown[] }) => boolean,
  timeoutMs = 15_000
): Promise<{ elements?: unknown[] }> {
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

/** Click scene-ish point assuming restored camera scroll≈0 zoom≈1. */
export async function clickScene(
  page: Page,
  sceneX: number,
  sceneY: number
): Promise<void> {
  const canvas = await excalidrawCanvas(page)
  const box = await canvas.boundingBox()
  if (!box) throw new Error('no canvas box')
  await page.mouse.click(box.x + sceneX, box.y + sceneY)
}

export function tmpAppData(prefix: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), prefix))
}
