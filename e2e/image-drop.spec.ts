import { access } from 'node:fs/promises'
import path from 'node:path'
import { test, expect } from '@playwright/test'
import { launchApp } from './helpers/launch'
import {
  closePdfSidebar,
  expectUnsaved,
  leaveToHome,
  tmpAppData,
  waitForSession
} from './helpers/canvas'
import { openPdf, readSessionFile, seedLibrary } from './helpers/seed'

/** 1×1 PNG — enough for Excalidraw insertImages. */
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function liveElements(snap: { elements?: unknown[] }): Record<string, unknown>[] {
  return (snap.elements ?? []).filter(
    (el): el is Record<string, unknown> =>
      !!el && typeof el === 'object' && (el as { isDeleted?: boolean }).isDeleted !== true
  )
}

function isDroppedImage(el: Record<string, unknown>): boolean {
  return (
    el.type === 'image' &&
    typeof el.fileId === 'string' &&
    el.fileId.length > 0 &&
    // Search-capture images carry pdfSearchCapture; plain drops do not.
    (el.customData as { pdfSearchCapture?: boolean } | undefined)?.pdfSearchCapture !== true
  )
}

/**
 * Regression: with selection tool + `.pdf-text-pass` over PDF text, OS image
 * drop used to hit `.textLayer` and Excalidraw never saw `onDrop`. Host must
 * clear pass on dragover (and re-dispatch drop if still on textLayer).
 *
 * Synthetic DataTransfer + DragEvent in evaluate — not Playwright file DnD
 * (flaky under Electron; see sidebar-dnd).
 */
test('drop PNG over PDF text with pdf-text-pass inserts image + attachment', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-img-drop-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)
    await closePdfSidebar(page)

    const span = page.locator('.textLayer span').filter({ hasText: 'Libritus' }).first()
    await span.waitFor({ state: 'visible', timeout: 60_000 })
    const box = await span.boundingBox()
    if (!box) throw new Error('text span has no box')
    const clientX = box.x + box.width / 2
    const clientY = box.y + box.height / 2

    // Arm pass over text (same as highlights / pass-through-race).
    await page.mouse.move(clientX, clientY)
    await expect
      .poll(
        async () =>
          page.evaluate(() =>
            document.querySelector('[data-pdf-canvas-root]')?.classList.contains('pdf-text-pass')
          ),
        { timeout: 5_000 }
      )
      .toBe(true)

    const dropResult = await page.evaluate(
      ({ x, y, b64 }) => {
        const root = document.querySelector('[data-pdf-canvas-root]')
        if (!(root instanceof HTMLElement)) return { ok: false as const, reason: 'no-root' }

        const binary = atob(b64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        const file = new File([bytes], 'drop.png', { type: 'image/png' })
        const dt = new DataTransfer()
        dt.items.add(file)
        if (dt.files.length !== 1) return { ok: false as const, reason: 'no-files-on-dt' }

        const hit = document.elementFromPoint(x, y)
        if (!(hit instanceof Element)) return { ok: false as const, reason: 'no-hit' }

        const over = new DragEvent('dragover', {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          dataTransfer: dt
        })
        if (!over.dataTransfer) return { ok: false as const, reason: 'dragover-no-dt' }
        hit.dispatchEvent(over)

        // Pass clear is sync; next hit should be Excalidraw (or drop re-dispatch).
        const hit2 = document.elementFromPoint(x, y)
        const dropTarget = hit2 instanceof Element ? hit2 : hit
        const drop = new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          dataTransfer: dt
        })
        if (!drop.dataTransfer) return { ok: false as const, reason: 'drop-no-dt' }
        dropTarget.dispatchEvent(drop)

        return {
          ok: true as const,
          passAfter: root.classList.contains('pdf-text-pass'),
          dropTag: dropTarget instanceof Element ? dropTarget.tagName : 'none'
        }
      },
      { x: clientX, y: clientY, b64: TINY_PNG_B64 }
    )

    expect(dropResult.ok, JSON.stringify(dropResult)).toBe(true)

    await expectUnsaved(page)
    await leaveToHome(page)

    const snap = await waitForSession(
      () => readSessionFile(appDataDir, pdfId),
      (s) => liveElements(s).some(isDroppedImage)
    )
    const img = liveElements(snap).find(isDroppedImage)!
    const fileId = img.fileId as string
    await access(path.join(appDataDir, 'attachments', `${fileId}.png`))
  } finally {
    await close()
  }
})
