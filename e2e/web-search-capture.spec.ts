import { mkdir, writeFile, access } from 'node:fs/promises'
import path from 'node:path'
import { test, expect } from '@playwright/test'
import { launchApp } from './helpers/launch'
import {
  clickScene,
  closePdfSidebar,
  expectSaved,
  expectUnsaved,
  leaveToHome,
  tmpAppData,
  waitForSession
} from './helpers/canvas'
import {
  openPdf,
  readSessionFile,
  seedHighlightElement,
  seedLibrary,
  seedNoteElement,
  seedSearchArrowElement,
  seedSearchCaptureElement,
  seedSession
} from './helpers/seed'

/** 1×1 PNG for restore / attachment fixtures. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

async function seedAttachmentPng(appDataDir: string, fileId: string): Promise<void> {
  const dir = path.join(appDataDir, 'attachments')
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, `${fileId}.png`), TINY_PNG)
}

function liveElements(snap: { elements?: unknown[] }): Record<string, unknown>[] {
  return (snap.elements ?? []).filter(
    (el): el is Record<string, unknown> =>
      !!el && typeof el === 'object' && (el as { isDeleted?: boolean }).isDeleted !== true
  )
}

function isSearchCapture(el: Record<string, unknown>): boolean {
  return (el.customData as { pdfSearchCapture?: boolean } | undefined)?.pdfSearchCapture === true
}

function isSearchArrow(el: Record<string, unknown>): boolean {
  return (el.customData as { pdfSearchArrow?: boolean } | undefined)?.pdfSearchArrow === true
}

async function expectBrowserChromeVisible(page: import('playwright').Page): Promise<void> {
  const chrome = page.locator('[data-browser-chrome]')
  await expect(chrome).toBeVisible({ timeout: 15_000 })
  await expect(chrome.getByRole('button', { name: 'Back', exact: true })).toBeVisible()
}

async function expectBrowserChromeHidden(page: import('playwright').Page): Promise<void> {
  await expect(page.locator('[data-browser-chrome]')).toBeHidden({ timeout: 15_000 })
}

async function guestUrl(page: import('playwright').Page): Promise<string> {
  const result = await page.evaluate(() =>
    (window as any).electron.ipcRenderer.invoke('browser:getUrl')
  )
  return typeof result?.url === 'string' ? result.url : ''
}

/**
 * Outside-click for deactivate. Must land on the Excalidraw canvas inside
 * `.excalidraw-host` — not PDF tools (`top-12` centered toolbar) and not
 * Excalidraw `@next` `.compact-shape-actions` (covers top-left when selected).
 * Seeded captures in these tests sit near (80,40)+(300×300).
 */
async function clickOutsideCapture(page: import('playwright').Page): Promise<void> {
  await clickScene(page, 200, 400)
}

test('Place browser creates unanchored search capture without arrow', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-place-browser-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })

  await seedSession(appDataDir, pdfId, {
    version: 1,
    docId: pdfId,
    updatedAt: new Date().toISOString(),
    camera: { scrollX: 0, scrollY: 0, zoom: 1 },
    elements: []
  })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)
    await closePdfSidebar(page)

    await page.getByRole('button', { name: 'Place browser' }).click()
    await clickScene(page, 450, 400)
    await expectUnsaved(page)
    await expect(page.locator('[data-pdf-search-capture]')).toHaveCount(1, { timeout: 10_000 })
    await expectBrowserChromeVisible(page)

    await leaveToHome(page)

    const snap = await waitForSession(
      () => readSessionFile(appDataDir, pdfId),
      (s) => liveElements(s).some(isSearchCapture)
    )

    const els = liveElements(snap)
    const captures = els.filter(isSearchCapture)
    expect(captures).toHaveLength(1)
    const capture = captures[0]!
    expect(capture.type).toBe('embeddable')
    expect(capture.link).toBe('libritus://pdf-search-capture')
    expect(capture.width).toBe(430)
    expect(capture.height).toBe(930)
    const data = capture.customData as {
      query?: string
      url?: string
      sourceHighlightId?: string
    }
    expect(data.query).toBe('')
    expect(data.url).toBe('https://www.google.com')
    expect(data.sourceHighlightId).toBeUndefined()
    expect(els.filter(isSearchArrow)).toHaveLength(0)
  } finally {
    await close()
  }
})

test('Paste http(s) URL creates unanchored search capture', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-paste-url-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })
  const pastedUrl = 'https://example.com/pasted-page'

  await seedSession(appDataDir, pdfId, {
    version: 1,
    docId: pdfId,
    updatedAt: new Date().toISOString(),
    camera: { scrollX: 0, scrollY: 0, zoom: 1 },
    elements: []
  })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)
    await closePdfSidebar(page)

    await clickScene(page, 400, 300)
    await page.evaluate((url) => {
      const root = document.querySelector('[data-pdf-canvas-root]')
      if (!(root instanceof HTMLElement)) throw new Error('missing canvas root')
      root.focus()
      const dt = new DataTransfer()
      dt.setData('text/plain', url)
      const event = new Event('paste', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'clipboardData', { value: dt })
      window.dispatchEvent(event)
    }, pastedUrl)

    await expectUnsaved(page)
    await expect(page.locator('[data-pdf-search-capture]')).toHaveCount(1, { timeout: 10_000 })
    await expectBrowserChromeVisible(page)

    await leaveToHome(page)

    const snap = await waitForSession(
      () => readSessionFile(appDataDir, pdfId),
      (s) => liveElements(s).some(isSearchCapture)
    )

    const els = liveElements(snap)
    const captures = els.filter(isSearchCapture)
    expect(captures).toHaveLength(1)
    const capture = captures[0]!
    expect(capture.type).toBe('embeddable')
    expect(capture.link).toBe('libritus://pdf-search-capture')
    const data = capture.customData as {
      query?: string
      url?: string
      sourceHighlightId?: string
    }
    expect(data.query).toBe('')
    expect(data.url).toBe(pastedUrl)
    expect(data.sourceHighlightId).toBeUndefined()
    expect(els.filter(isSearchArrow)).toHaveLength(0)
  } finally {
    await close()
  }
})

/**
 * Chrome link / address-bar drag: text/uri-list (+ optional text/plain), no Files,
 * no <img>. Host creates unanchored search capture at drop point + auto-activates.
 * Image drops (HTML img src) remain preferred when present — covered by image-drop.spec.
 */
test('Drop http(s) URL creates unanchored search capture', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-drop-url-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })
  const droppedUrl = 'https://example.com/dropped-page'

  await seedSession(appDataDir, pdfId, {
    version: 1,
    docId: pdfId,
    updatedAt: new Date().toISOString(),
    camera: { scrollX: 0, scrollY: 0, zoom: 1 },
    elements: []
  })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)
    await closePdfSidebar(page)

    const pageEl = page.locator('[data-pdf-page="0"]')
    await pageEl.waitFor({ state: 'visible', timeout: 60_000 })
    const box = await pageEl.boundingBox()
    if (!box) throw new Error('pdf page has no box')
    const clientX = box.x + box.width / 2
    const clientY = box.y + box.height / 2

    const dropResult = await page.evaluate(
      ({ x, y, url }) => {
        const root = document.querySelector('[data-pdf-canvas-root]')
        if (!(root instanceof HTMLElement)) return { ok: false as const, reason: 'no-root' }

        const dt = new DataTransfer()
        dt.setData('text/uri-list', url)
        dt.setData('text/plain', url)
        // No Files, no HTML img — mirrors Chrome link / address-bar drag.

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

        return { ok: true as const }
      },
      { x: clientX, y: clientY, url: droppedUrl }
    )
    expect(dropResult).toEqual({ ok: true })

    await expectUnsaved(page)
    await expect(page.locator('[data-pdf-search-capture]')).toHaveCount(1, { timeout: 10_000 })
    await expectBrowserChromeVisible(page)

    await leaveToHome(page)

    const snap = await waitForSession(
      () => readSessionFile(appDataDir, pdfId),
      (s) => liveElements(s).some(isSearchCapture)
    )

    const els = liveElements(snap)
    const captures = els.filter(isSearchCapture)
    expect(captures).toHaveLength(1)
    const capture = captures[0]!
    expect(capture.type).toBe('embeddable')
    expect(capture.link).toBe('libritus://pdf-search-capture')
    const data = capture.customData as {
      query?: string
      url?: string
      sourceHighlightId?: string
    }
    expect(data.query).toBe('')
    expect(data.url).toBe(droppedUrl)
    expect(data.sourceHighlightId).toBeUndefined()
    expect(els.filter(isSearchArrow)).toHaveLength(0)
  } finally {
    await close()
  }
})

/** text/plain-only URL drag (no uri-list / html types). */
test('Drop text/plain-only http(s) URL creates search capture', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-drop-url-plain-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })
  const droppedUrl = 'https://example.com/plain-only'

  await seedSession(appDataDir, pdfId, {
    version: 1,
    docId: pdfId,
    updatedAt: new Date().toISOString(),
    camera: { scrollX: 0, scrollY: 0, zoom: 1 },
    elements: []
  })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)
    await closePdfSidebar(page)

    const pageEl = page.locator('[data-pdf-page="0"]')
    await pageEl.waitFor({ state: 'visible', timeout: 60_000 })
    const box = await pageEl.boundingBox()
    if (!box) throw new Error('pdf page has no box')
    const clientX = box.x + box.width / 2
    const clientY = box.y + box.height / 2

    const dropResult = await page.evaluate(
      ({ x, y, url }) => {
        const dt = new DataTransfer()
        dt.setData('text/plain', url)

        const hit = document.elementFromPoint(x, y)
        if (!(hit instanceof Element)) return { ok: false as const, reason: 'no-hit' }

        hit.dispatchEvent(
          new DragEvent('dragover', {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            dataTransfer: dt
          })
        )
        const hit2 = document.elementFromPoint(x, y)
        const dropTarget = hit2 instanceof Element ? hit2 : hit
        dropTarget.dispatchEvent(
          new DragEvent('drop', {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            dataTransfer: dt
          })
        )
        return { ok: true as const }
      },
      { x: clientX, y: clientY, url: droppedUrl }
    )
    expect(dropResult).toEqual({ ok: true })

    await expectUnsaved(page)
    await expect(page.locator('[data-pdf-search-capture]')).toHaveCount(1, { timeout: 10_000 })
    await expectBrowserChromeVisible(page)

    await leaveToHome(page)

    const snap = await waitForSession(
      () => readSessionFile(appDataDir, pdfId),
      (s) => liveElements(s).some(isSearchCapture)
    )
    const capture = liveElements(snap).find(isSearchCapture)!
    expect((capture.customData as { url?: string }).url).toBe(droppedUrl)
  } finally {
    await close()
  }
})

test('Search from highlight creates search capture + host-managed arrow', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-buscar-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })
  const hlX = 80
  const hlY = 120

  await seedSession(appDataDir, pdfId, {
    version: 1,
    docId: pdfId,
    updatedAt: new Date().toISOString(),
    camera: { scrollX: 0, scrollY: 0, zoom: 1 },
    elements: [seedHighlightElement({ id: 'hl-1', x: hlX, y: hlY, text: 'buscar query' })]
  })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)
    await closePdfSidebar(page)

    await clickScene(page, hlX + 40, hlY + 9)
    await page
      .locator('[data-highlight-toolbar]')
      .getByRole('button', { name: 'Search' })
      .click({ timeout: 10_000 })
    await expect(page.getByText('Unsaved')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[data-pdf-search-capture]')).toHaveCount(1, { timeout: 10_000 })
    await expectBrowserChromeVisible(page)

    await leaveToHome(page)

    const snap = await waitForSession(
      () => readSessionFile(appDataDir, pdfId),
      (s) =>
        (s.elements ?? []).some(
          (el) =>
            el &&
            typeof el === 'object' &&
            (el as { customData?: { pdfSearchCapture?: boolean } }).customData?.pdfSearchCapture ===
              true
        )
    )

    const capture = (snap.elements ?? []).find(
      (el) =>
        el &&
        typeof el === 'object' &&
        (el as { customData?: { pdfSearchCapture?: boolean } }).customData?.pdfSearchCapture ===
          true
    ) as {
      id: string
      type?: string
      link?: string
      width?: number
      height?: number
      customData?: { query?: string; url?: string; sourceHighlightId?: string }
    }
    const arrow = (snap.elements ?? []).find(
      (el) =>
        el &&
        typeof el === 'object' &&
        (el as { customData?: { pdfSearchArrow?: boolean } }).customData?.pdfSearchArrow === true
    ) as {
      locked?: boolean
      elbowed?: boolean
      startBinding?: unknown
      endBinding?: unknown
      customData?: { captureId?: string }
    }

    expect(capture.type).toBe('embeddable')
    expect(capture.link).toBe('libritus://pdf-search-capture')
    expect(capture.width).toBe(430)
    expect(capture.height).toBe(930)
    expect(capture.customData?.query).toBe('buscar query')
    expect(capture.customData?.url).toContain('buscar%20query')
    expect(capture.customData?.sourceHighlightId).toBe('hl-1')
    expect(arrow.locked).toBe(true)
    expect(arrow.elbowed).toBeFalsy()
    expect(arrow.startBinding).toBeFalsy()
    expect(arrow.endBinding).toBeFalsy()
    expect(arrow.customData?.captureId).toBe(capture.id)
  } finally {
    await close()
  }
})

test('Remove highlight cascades search capture + arrow', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-search-cascade-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })
  const hlX = 80
  const hlY = 120
  const groupId = 'hl-search-cascade'
  const captureId = 'linked-search'
  const capX = 220
  const capY = 40

  await seedSession(appDataDir, pdfId, {
    version: 1,
    docId: pdfId,
    updatedAt: new Date().toISOString(),
    camera: { scrollX: 0, scrollY: 0, zoom: 1 },
    elements: [
      seedHighlightElement({
        id: 'hl-search-cascade',
        x: hlX,
        y: hlY,
        text: 'quoted',
        groupId
      }),
      seedSearchCaptureElement({
        id: captureId,
        x: capX,
        y: capY,
        query: 'quoted',
        url: 'https://example.com',
        sourceHighlightId: groupId
      }),
      seedSearchArrowElement({
        id: 'linked-search-arrow',
        captureId,
        startX: hlX + 120,
        startY: hlY + 9,
        side: 'right'
      }),
      seedNoteElement({ id: 'place-keep', x: 500, y: 300, text: 'keep me' })
    ]
  })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)
    await closePdfSidebar(page)

    await clickScene(page, hlX + 40, hlY + 9)
    await page.getByRole('button', { name: 'Remove' }).click({ timeout: 10_000 })
    await expectUnsaved(page)

    await leaveToHome(page)

    const snap = await waitForSession(
      () => readSessionFile(appDataDir, pdfId),
      (s) => {
        const live = liveElements(s)
        return (
          !live.some((el) => (el.customData as { pdfHighlight?: boolean })?.pdfHighlight) &&
          !live.some(isSearchCapture) &&
          !live.some(isSearchArrow)
        )
      }
    )

    const live = liveElements(snap)
    expect(live.some((el) => (el.id as string) === 'place-keep')).toBe(true)
    expect(live.some(isSearchCapture)).toBe(false)
    expect(live.some(isSearchArrow)).toBe(false)
  } finally {
    await close()
  }
})

test('deleting search capture cascades arrow', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-search-del-cap-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })
  const hlX = 80
  const hlY = 120
  const groupId = 'hl-del-cap'
  const captureId = 'cap-to-delete'
  const capX = 220
  const capY = 40

  await seedSession(appDataDir, pdfId, {
    version: 1,
    docId: pdfId,
    updatedAt: new Date().toISOString(),
    camera: { scrollX: 0, scrollY: 0, zoom: 1 },
    elements: [
      seedHighlightElement({
        id: 'hl-del-cap',
        x: hlX,
        y: hlY,
        text: 'quoted',
        groupId
      }),
      seedSearchCaptureElement({
        id: captureId,
        x: capX,
        y: capY,
        query: 'quoted',
        url: 'https://example.com',
        sourceHighlightId: groupId
      }),
      seedSearchArrowElement({
        id: 'arrow-to-cascade',
        captureId,
        startX: hlX + 120,
        startY: hlY + 9,
        side: 'right'
      }),
      seedNoteElement({ id: 'place-keep', x: 500, y: 300, text: 'keep me' })
    ]
  })

  const { page, close } = await launchApp({ appDataDir })
  try {
    await expect(page.getByRole('heading', { name: 'Welcome to Libritus' })).toBeVisible({
      timeout: 30_000
    })
    await openPdf(page, categoryId, pdfId)
    await closePdfSidebar(page)

    await expect(page.locator('[data-pdf-search-capture]')).toHaveCount(1, { timeout: 10_000 })

    // Edge click selects without activating the guest browser (center third).
    await clickScene(page, capX + 4, capY + 4)
    await page.keyboard.press('Backspace')
    await expectUnsaved(page)
    await expect(page.locator('[data-pdf-search-capture]')).toHaveCount(0, { timeout: 10_000 })

    await leaveToHome(page)

    const snap = await waitForSession(
      () => readSessionFile(appDataDir, pdfId),
      (s) => {
        const live = liveElements(s)
        return !live.some(isSearchCapture) && !live.some(isSearchArrow)
      }
    )

    const live = liveElements(snap)
    expect(live.some((el) => (el.id as string) === 'place-keep')).toBe(true)
    expect(live.some((el) => (el.customData as { pdfHighlight?: boolean })?.pdfHighlight)).toBe(
      true
    )
    expect(live.some(isSearchCapture)).toBe(false)
    expect(live.some(isSearchArrow)).toBe(false)
  } finally {
    await close()
  }
})

test('deleting search capture while browsing disposes guest', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-search-del-browse-')
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
        id: 'cap-del-browse',
        x: capX,
        y: capY,
        width: capW,
        height: capH,
        query: 'dispose',
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

    await expect(page.locator('[data-pdf-search-capture]')).toHaveCount(1, { timeout: 15_000 })

    await clickScene(page, capX + capW / 2, capY + capH / 2)
    await expectBrowserChromeVisible(page)
    await page.waitForTimeout(900)

    // Edge select keeps guest; Backspace must dispose without an outside click.
    await clickScene(page, capX + 4, capY + 4)
    await page.keyboard.press('Backspace')

    await expectBrowserChromeHidden(page)
    await expect(page.locator('[data-pdf-search-capture]')).toHaveCount(0, { timeout: 10_000 })
  } finally {
    await close()
  }
})

test('undo delete search capture restores arrow', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-search-undo-arrow-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })
  const hlX = 80
  const hlY = 120
  const groupId = 'hl-undo-cap'
  const captureId = 'cap-undo'
  const capX = 220
  const capY = 40

  await seedSession(appDataDir, pdfId, {
    version: 1,
    docId: pdfId,
    updatedAt: new Date().toISOString(),
    camera: { scrollX: 0, scrollY: 0, zoom: 1 },
    elements: [
      seedHighlightElement({
        id: 'hl-undo-cap',
        x: hlX,
        y: hlY,
        text: 'quoted',
        groupId
      }),
      seedSearchCaptureElement({
        id: captureId,
        x: capX,
        y: capY,
        query: 'quoted',
        url: 'https://example.com',
        sourceHighlightId: groupId
      }),
      seedSearchArrowElement({
        id: 'arrow-undo',
        captureId,
        startX: hlX + 120,
        startY: hlY + 9,
        side: 'right'
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

    await expect(page.locator('[data-pdf-search-capture]')).toHaveCount(1, { timeout: 10_000 })

    await clickScene(page, capX + 4, capY + 4)
    await page.keyboard.press('Backspace')
    await expect(page.locator('[data-pdf-search-capture]')).toHaveCount(0, { timeout: 10_000 })
    await expectUnsaved(page)
    // Flush deleted scene so undo isn't a no-op against the seed signature.
    await expectSaved(page)

    await page.keyboard.press('ControlOrMeta+Z')
    await expect(page.locator('[data-pdf-search-capture]')).toHaveCount(1, { timeout: 10_000 })
    await expectUnsaved(page)

    await leaveToHome(page)

    const snap = await waitForSession(
      () => readSessionFile(appDataDir, pdfId),
      (s) => {
        const live = liveElements(s)
        return live.some(isSearchCapture) && live.some(isSearchArrow)
      }
    )

    const live = liveElements(snap)
    expect(live.some(isSearchCapture)).toBe(true)
    expect(live.some(isSearchArrow)).toBe(true)
    const arrow = live.find(isSearchArrow)!
    expect((arrow.customData as { captureId?: string }).captureId).toBe(captureId)
  } finally {
    await close()
  }
})

test('center-click activates browse; outside click captures PNG as native image', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-search-activate-')
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
        id: 'cap-activate',
        x: capX,
        y: capY,
        width: capW,
        height: capH,
        query: 'example',
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

    await expect(page.locator('[data-pdf-search-capture]')).toHaveCount(1, { timeout: 15_000 })

    // Middle third of the card (host-owned activate for embeddable).
    await clickScene(page, capX + capW / 2, capY + capH / 2)
    await expectBrowserChromeVisible(page)

    // Let guest load a bit, then wait out open grace and click outside.
    await page.waitForTimeout(1200)
    await clickOutsideCapture(page)
    await expectBrowserChromeHidden(page)
    await expectUnsaved(page)

    await leaveToHome(page)

    const snap = await waitForSession(
      () => readSessionFile(appDataDir, pdfId),
      (s) => {
        const cap = liveElements(s).find(isSearchCapture)
        return (
          !!cap &&
          cap.type === 'image' &&
          typeof (cap.customData as { fileId?: string })?.fileId === 'string'
        )
      }
    )

    const cap = liveElements(snap).find(isSearchCapture)!
    expect(cap.type).toBe('image')
    const fileId = (cap.customData as { fileId: string }).fileId
    expect(fileId).toBeTruthy()
    await access(path.join(appDataDir, 'attachments', `${fileId}.png`))
  } finally {
    await close()
  }
})

test('open grace ignores outside click for 800ms', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-search-grace-')
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
        id: 'cap-grace',
        x: capX,
        y: capY,
        width: capW,
        height: capH,
        query: 'grace',
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

    await clickScene(page, capX + capW / 2, capY + capH / 2)
    await expectBrowserChromeVisible(page)

    // Immediate outside click must not close (renderer + main grace).
    await clickOutsideCapture(page)
    await expectBrowserChromeVisible(page)

    await page.waitForTimeout(900)
    await clickOutsideCapture(page)
    await expectBrowserChromeHidden(page)
  } finally {
    await close()
  }
})

test('while browsing, edge resize keeps guest and free aspect', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-search-resize-')
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
        id: 'cap-resize',
        x: capX,
        y: capY,
        width: capW,
        height: capH,
        query: 'resize',
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

    await expect(page.locator('[data-pdf-search-capture]')).toHaveCount(1, { timeout: 15_000 })

    // Select via right-edge hit (outside center-third — does not activate).
    await clickScene(page, capX + capW - 10, capY + capH / 2)
    await clickScene(page, capX + capW / 2, capY + capH / 2)
    await expectBrowserChromeVisible(page)
    await page.waitForTimeout(1200)

    // Guest WCV aligns to chrome left/width (chrome sits just above the card).
    const chromeBox = await page.locator('[data-browser-chrome]').boundingBox()
    if (!chromeBox) throw new Error('no chrome box')
    const edgeX = chromeBox.x + chromeBox.width + 6
    const midY = chromeBox.y + chromeBox.height + capH / 2
    await page.mouse.move(edgeX, midY)
    await page.mouse.down()
    await page.mouse.move(edgeX + 100, midY, { steps: 12 })
    await page.mouse.up()
    await expectBrowserChromeVisible(page)

    await clickOutsideCapture(page)
    await expectBrowserChromeHidden(page)
    await expectUnsaved(page)

    await leaveToHome(page)

    const snap = await waitForSession(
      () => readSessionFile(appDataDir, pdfId),
      (s) => {
        const cap = liveElements(s).find(isSearchCapture)
        return (
          !!cap &&
          cap.type === 'image' &&
          typeof (cap.customData as { fileId?: string })?.fileId === 'string' &&
          typeof cap.width === 'number' &&
          (cap.width as number) > capW + 40
        )
      }
    )

    const cap = liveElements(snap).find(isSearchCapture)!
    expect(cap.type).toBe('image')
    expect(cap.width as number).toBeGreaterThan(capW + 40)
    // Free axis: height must not grow with the diagonal aspect lock (~same as seed).
    expect(Math.abs((cap.height as number) - capH)).toBeLessThan(20)
  } finally {
    await close()
  }
})

test('session restore keeps image search capture with attachment', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-search-restore-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })
  const fileId = 'restore-att-1'
  await seedAttachmentPng(appDataDir, fileId)

  await seedSession(appDataDir, pdfId, {
    version: 1,
    docId: pdfId,
    updatedAt: new Date().toISOString(),
    camera: { scrollX: 0, scrollY: 0, zoom: 1 },
    elements: [
      seedSearchCaptureElement({
        id: 'cap-restore',
        x: 80,
        y: 40,
        width: 300,
        height: 300,
        query: 'restored',
        url: 'https://example.com/page',
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

    // Image elements paint via Excalidraw files — no [data-pdf-search-capture] embed.
    await page.getByLabel('Current page').waitFor({ state: 'visible' })

    await leaveToHome(page)

    const snap = await waitForSession(
      () => readSessionFile(appDataDir, pdfId),
      (s) => liveElements(s).some(isSearchCapture)
    )

    const cap = liveElements(snap).find(isSearchCapture)!
    expect(cap.type).toBe('image')
    expect((cap.customData as { fileId?: string }).fileId).toBe(fileId)
    expect((cap as { fileId?: string }).fileId).toBe(fileId)
  } finally {
    await close()
  }
})

test('center-click re-activates browse on native image capture', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-search-reactivate-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })
  const capX = 80
  const capY = 40
  const capW = 300
  const capH = 300
  const fileId = 'reactivate-att'
  await seedAttachmentPng(appDataDir, fileId)

  await seedSession(appDataDir, pdfId, {
    version: 1,
    docId: pdfId,
    updatedAt: new Date().toISOString(),
    camera: { scrollX: 0, scrollY: 0, zoom: 1 },
    elements: [
      seedSearchCaptureElement({
        id: 'cap-reactivate',
        x: capX,
        y: capY,
        width: capW,
        height: capH,
        query: 'again',
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

    await clickScene(page, capX + capW / 2, capY + capH / 2)
    await expectBrowserChromeVisible(page)
    await expect.poll(() => guestUrl(page), { timeout: 15_000 }).toMatch(/^https?:\/\//)

    await page.waitForTimeout(1200)
    await clickOutsideCapture(page)
    await expectBrowserChromeHidden(page)

    // Re-activate ASAP (same URL) — must not stick on about:blank from deactivate.
    await clickScene(page, capX + capW / 2, capY + capH / 2)
    await expectBrowserChromeVisible(page)
    await expect
      .poll(() => guestUrl(page), { timeout: 15_000 })
      .toMatch(/^https?:\/\/(?:www\.)?example\.com/i)
  } finally {
    await close()
  }
})

test('Excalidraw style panel click does not activate search capture underneath', async () => {
  const appDataDir = await tmpAppData('libritus-e2e-style-panel-')
  const { categoryId, pdfId } = await seedLibrary({ appDataDir })
  // Capture sits under the left SelectedShapeActions panel in scene space.
  const capX = 0
  const capY = 40
  const capW = 300
  const capH = 420
  const rectX = 520
  const rectY = 180

  await seedSession(appDataDir, pdfId, {
    version: 1,
    docId: pdfId,
    updatedAt: new Date().toISOString(),
    camera: { scrollX: 0, scrollY: 0, zoom: 1 },
    elements: [
      seedSearchCaptureElement({
        id: 'cap-under-panel',
        x: capX,
        y: capY,
        width: capW,
        height: capH,
        query: 'under-panel',
        url: 'https://example.com'
      }),
      {
        id: 'decoy-rect',
        type: 'rectangle',
        x: rectX,
        y: rectY,
        width: 140,
        height: 90,
        angle: 0,
        strokeColor: '#1971c2',
        backgroundColor: '#a5d8ff',
        fillStyle: 'solid',
        strokeWidth: 2,
        strokeStyle: 'solid',
        roughness: 0,
        opacity: 100,
        groupIds: [],
        frameId: null,
        index: 'a9',
        roundness: null,
        seed: 9,
        version: 1,
        versionNonce: 9,
        isDeleted: false,
        boundElements: null,
        updated: 1,
        link: null,
        locked: false,
        customData: null
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

    await expect(page.locator('[data-pdf-search-capture]')).toHaveCount(1, { timeout: 15_000 })

    // Select free rectangle → style panel opens over the capture (scene-left).
    await clickScene(page, rectX + 70, rectY + 45)
    // Excalidraw @next: `.selected-shape-actions` / compact (was `.App-menu__left`).
    const panel = page.getByRole('region', { name: 'Selected shape actions' })
    await expect(panel).toBeVisible({ timeout: 10_000 })

    // Click stroke chrome over the capture — must not activate browse underneath.
    await panel
      .getByRole('button', { name: 'Stroke', description: 'Show stroke color picker' })
      .click()

    // Regression: host scene hit-test must ignore .layer-ui__wrapper.
    await page.waitForTimeout(600)
    await expectBrowserChromeHidden(page)
  } finally {
    await close()
  }
})
