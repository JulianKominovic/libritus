import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Page } from 'playwright'
import type { SessionSnapshot } from '../../src/renderer/src/lib/pdf-canvas/sessionTypes'

export const DEFAULT_CAT_ID = 'e2e-cat'
export const DEFAULT_PDF_ID = 'e2e-pdf'

export type SeedLibraryOpts = {
  appDataDir: string
  categoryId?: string
  pdfId?: string
  pdfFixture?: string
  pages?: number
}

function pdfEntry(
  pdfId: string,
  pages: number,
  now: string,
  name = 'Sample'
): Record<string, unknown> {
  return {
    id: pdfId,
    name,
    filename: `${pdfId}.pdf`,
    src: `${pdfId}.pdf`,
    size: 869,
    createdAt: now,
    updatedAt: now,
    pages,
    thumbnail: '',
    author: '',
    hexColor: '#ffffff',
    creationDate: null,
    modificationDate: null,
    progress: { percentage: 0, pages: 0, offset: 0 }
  }
}

export async function seedLibrary(opts: SeedLibraryOpts): Promise<{
  categoryId: string
  pdfId: string
}> {
  const categoryId = opts.categoryId ?? DEFAULT_CAT_ID
  const pdfId = opts.pdfId ?? DEFAULT_PDF_ID
  const pages = opts.pages ?? 1
  const fixture =
    opts.pdfFixture ?? path.join(process.cwd(), 'e2e/fixtures/sample.pdf')

  await mkdir(opts.appDataDir, { recursive: true })
  await copyFile(fixture, path.join(opts.appDataDir, `${pdfId}.pdf`))

  const now = new Date().toISOString()
  const categories = [
    {
      id: categoryId,
      name: 'E2E',
      description: 'e2e fixture',
      createdAt: now,
      updatedAt: now,
      icon: 'circle-dot',
      color: '#555',
      pdfs: [pdfEntry(pdfId, pages, now)]
    }
  ]
  await writeFile(path.join(opts.appDataDir, 'categories.json'), JSON.stringify(categories))
  return { categoryId, pdfId }
}

/** Two categories: source has one PDF, destination is empty. */
export async function seedTwoCategories(opts: {
  appDataDir: string
  sourceId?: string
  destId?: string
  pdfId?: string
  pages?: number
}): Promise<{
  sourceId: string
  destId: string
  pdfId: string
}> {
  const sourceId = opts.sourceId ?? 'e2e-source'
  const destId = opts.destId ?? 'e2e-dest'
  const pdfId = opts.pdfId ?? DEFAULT_PDF_ID
  const pages = opts.pages ?? 1
  const fixture = path.join(process.cwd(), 'e2e/fixtures/sample.pdf')

  await mkdir(opts.appDataDir, { recursive: true })
  await copyFile(fixture, path.join(opts.appDataDir, `${pdfId}.pdf`))

  const now = new Date().toISOString()
  const categories = [
    {
      id: sourceId,
      name: 'Source',
      description: 'source category',
      createdAt: now,
      updatedAt: now,
      icon: 'circle-dot',
      color: '#555',
      pdfs: [pdfEntry(pdfId, pages, now)]
    },
    {
      id: destId,
      name: 'Dest',
      description: 'destination category',
      createdAt: now,
      updatedAt: now,
      icon: 'folder',
      color: '#888',
      pdfs: []
    }
  ]
  await writeFile(path.join(opts.appDataDir, 'categories.json'), JSON.stringify(categories))
  return { sourceId, destId, pdfId }
}

/** Append another PDF to an existing seeded category (does not overwrite catalog). */
export async function seedExtraPdf(opts: SeedLibraryOpts & { categoryId: string }): Promise<{
  categoryId: string
  pdfId: string
}> {
  const categoryId = opts.categoryId
  const pdfId = opts.pdfId ?? `e2e-pdf-${Date.now()}`
  const pages = opts.pages ?? 1
  const fixture =
    opts.pdfFixture ?? path.join(process.cwd(), 'e2e/fixtures/sample.pdf')

  await copyFile(fixture, path.join(opts.appDataDir, `${pdfId}.pdf`))

  const catPath = path.join(opts.appDataDir, 'categories.json')
  const categories = JSON.parse(await readFile(catPath, 'utf8')) as Array<{
    id: string
    pdfs: Record<string, unknown>[]
  }>
  const cat = categories.find((c) => c.id === categoryId)
  if (!cat) throw new Error(`category ${categoryId} not found`)
  const now = new Date().toISOString()
  cat.pdfs.push(pdfEntry(pdfId, pages, now, opts.pdfId ?? 'Sample B'))
  await writeFile(catPath, JSON.stringify(categories))
  return { categoryId, pdfId }
}

export async function seedSession(
  appDataDir: string,
  pdfId: string,
  snapshot: SessionSnapshot
): Promise<void> {
  await writeFile(
    path.join(appDataDir, `${pdfId}.session.json`),
    JSON.stringify(snapshot)
  )
}

export async function readSessionFile(
  appDataDir: string,
  pdfId: string
): Promise<SessionSnapshot | null> {
  try {
    const text = await readFile(path.join(appDataDir, `${pdfId}.session.json`), 'utf8')
    return JSON.parse(text) as SessionSnapshot
  } catch {
    return null
  }
}

/** Client-side navigate to PDF route (does not wait for canvas ready). */
export async function navigatePdf(
  page: Page,
  categoryId: string,
  pdfId: string
): Promise<void> {
  await page.evaluate(
    ({ categoryId: cat, pdfId: id }) => {
      history.pushState(null, '', `/category/${cat}/${id}`)
      window.dispatchEvent(new PopStateEvent('popstate'))
    },
    { categoryId, pdfId }
  )
}

export async function openPdf(
  page: Page,
  categoryId: string,
  pdfId: string
): Promise<void> {
  await navigatePdf(page, categoryId, pdfId)
  await page.getByLabel('Current page').waitFor({ state: 'visible', timeout: 60_000 })
}

/** Minimal note element shape for session seeding (Excalidraw-compatible fields). */
export function seedNoteElement(opts?: {
  id?: string
  x?: number
  y?: number
  text?: string
}): Record<string, unknown> {
  const id = opts?.id ?? 'seed-note'
  const text = opts?.text ?? 'seeded note'
  return {
    id,
    type: 'embeddable',
    x: opts?.x ?? 120,
    y: opts?.y ?? 80,
    width: 320,
    height: 240,
    angle: 0,
    strokeColor: 'transparent',
    backgroundColor: '#ebebeb',
    fillStyle: 'solid',
    strokeWidth: 0,
    strokeStyle: 'solid',
    roughness: 0,
    opacity: 100,
    groupIds: [],
    frameId: null,
    index: 'a0',
    roundness: null,
    seed: 1,
    version: 1,
    versionNonce: 1,
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: 'libritus://pdf-note',
    locked: false,
    customData: {
      pdfNote: true,
      plateValue: [{ type: 'p', children: [{ text }] }]
    }
  }
}

export function seedHighlightElement(opts?: {
  id?: string
  x?: number
  y?: number
  text?: string
  groupId?: string
}): Record<string, unknown> {
  const id = opts?.id ?? 'seed-hl'
  return {
    id,
    type: 'rectangle',
    x: opts?.x ?? 40,
    y: opts?.y ?? 100,
    width: 120,
    height: 18,
    angle: 0,
    strokeColor: 'transparent',
    backgroundColor: '#FF00FF',
    fillStyle: 'solid',
    strokeWidth: 0,
    strokeStyle: 'solid',
    roughness: 0,
    opacity: 20,
    groupIds: [],
    frameId: null,
    index: 'a1',
    roundness: null,
    seed: 2,
    version: 1,
    versionNonce: 2,
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: true,
    customData: {
      pdfHighlight: true,
      text: opts?.text ?? 'highlighted',
      ...(opts?.groupId ? { groupId: opts.groupId } : {})
    }
  }
}

/** Search capture card for session seeding (embeddable placeholder or image + fileId). */
export function seedSearchCaptureElement(opts?: {
  id?: string
  x?: number
  y?: number
  width?: number
  height?: number
  query?: string
  url?: string
  sourceHighlightId?: string
  fileId?: string
  capturedAt?: string
}): Record<string, unknown> {
  const id = opts?.id ?? 'seed-search-capture'
  const query = opts?.query ?? 'seeded query'
  const url = opts?.url ?? `https://www.google.com/search?q=${encodeURIComponent(query)}`
  const fileId = opts?.fileId
  const customData: Record<string, unknown> = {
    pdfSearchCapture: true,
    query,
    url,
    ...(opts?.sourceHighlightId ? { sourceHighlightId: opts.sourceHighlightId } : {}),
    ...(fileId
      ? { fileId, capturedAt: opts?.capturedAt ?? new Date().toISOString() }
      : {})
  }

  if (fileId) {
    return {
      id,
      type: 'image',
      x: opts?.x ?? 200,
      y: opts?.y ?? 40,
      width: opts?.width ?? 300,
      height: opts?.height ?? 300,
      angle: 0,
      strokeColor: 'transparent',
      backgroundColor: 'transparent',
      fillStyle: 'solid',
      strokeWidth: 0,
      strokeStyle: 'solid',
      roughness: 0,
      opacity: 100,
      groupIds: [],
      frameId: null,
      index: 'a3',
      roundness: null,
      seed: 4,
      version: 1,
      versionNonce: 4,
      isDeleted: false,
      boundElements: null,
      updated: 1,
      link: null,
      locked: false,
      fileId,
      status: 'saved',
      scale: [1, 1],
      crop: null,
      customData
    }
  }

  return {
    id,
    type: 'embeddable',
    x: opts?.x ?? 200,
    y: opts?.y ?? 40,
    width: opts?.width ?? 300,
    height: opts?.height ?? 300,
    angle: 0,
    strokeColor: 'transparent',
    backgroundColor: '#e9ecef',
    fillStyle: 'solid',
    strokeWidth: 0,
    strokeStyle: 'solid',
    roughness: 0,
    opacity: 100,
    groupIds: [],
    frameId: null,
    index: 'a3',
    roundness: null,
    seed: 4,
    version: 1,
    versionNonce: 4,
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: 'libritus://pdf-search-capture',
    locked: false,
    customData
  }
}

export function seedSearchArrowElement(opts: {
  id?: string
  captureId: string
  startX: number
  startY: number
  side?: 'left' | 'right'
  width?: number
  height?: number
}): Record<string, unknown> {
  const width = opts.width ?? 60
  const height = opts.height ?? 0
  return {
    id: opts.id ?? 'seed-search-arrow',
    type: 'arrow',
    x: opts.startX,
    y: opts.startY,
    width,
    height,
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
    index: 'a4',
    roundness: null,
    seed: 5,
    version: 1,
    versionNonce: 5,
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: true,
    startBinding: null,
    endBinding: null,
    points: [
      [0, 0],
      [width, height]
    ],
    customData: {
      pdfSearchArrow: true,
      captureId: opts.captureId,
      side: opts.side ?? 'right',
      startX: opts.startX,
      startY: opts.startY
    }
  }
}
