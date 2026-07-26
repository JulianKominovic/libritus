import { mkdir, writeFile, access } from 'node:fs/promises'
import path from 'node:path'
import { test, expect } from '@playwright/test'
import { launchApp } from './helpers/launch'
import {
  clickScene,
  closePdfSidebar,
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
      !!el &&
      typeof el === 'object' &&
      (el as { isDeleted?: boolean }).isDeleted !== true
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

test('Buscar from highlight creates search capture + host-managed arrow', async () => {
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
    await page.getByRole('button', { name: 'Buscar' }).click({ timeout: 10_000 })
    await expect(page.getByText('Unsaved')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[data-pdf-search-capture]')).toHaveCount(1, { timeout: 10_000 })

    await leaveToHome(page)

    const snap = await waitForSession(
      () => readSessionFile(appDataDir, pdfId),
      (s) =>
        (s.elements ?? []).some(
          (el) =>
            el &&
            typeof el === 'object' &&
            (el as { customData?: { pdfSearchCapture?: boolean } }).customData
              ?.pdfSearchCapture === true
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
    await clickScene(page, 20, 20)
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
    await clickScene(page, 20, 20)
    await expectBrowserChromeVisible(page)

    await page.waitForTimeout(900)
    await clickScene(page, 20, 20)
    await expectBrowserChromeHidden(page)
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

    await page.waitForTimeout(1200)
    await clickScene(page, 20, 20)
    await expectBrowserChromeHidden(page)

    // Re-activate the image-backed capture (not an embeddable).
    await clickScene(page, capX + capW / 2, capY + capH / 2)
    await expectBrowserChromeVisible(page)
  } finally {
    await close()
  }
})
