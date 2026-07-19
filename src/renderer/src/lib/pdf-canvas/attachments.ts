import type { BinaryFileData, BinaryFiles, DataURL } from '@excalidraw/excalidraw/types'
import { mkdir, readFile, writeFile } from '../../integrations/fs'

const ATTACHMENTS_DIR = 'attachments'

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
  'image/x-icon': 'ico',
  'image/avif': 'avif',
  'image/jfif': 'jfif',
  'application/octet-stream': 'bin'
}

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  avif: 'image/avif',
  jfif: 'image/jfif',
  bin: 'application/octet-stream'
}

const LOAD_EXTS = Object.keys(MIME_BY_EXT)

let dirReady: Promise<boolean> | null = null

export function mimeToExt(mimeType: string): string {
  return EXT_BY_MIME[mimeType] ?? 'bin'
}

export function extToMime(ext: string): string {
  return MIME_BY_EXT[ext.toLowerCase()] ?? 'application/octet-stream'
}

export function attachmentFilename(fileId: string, mimeType: string): string {
  return `${ATTACHMENTS_DIR}/${fileId}.${mimeToExt(mimeType)}`
}

/** Paths to try when restoring an attachment by id only. */
export function attachmentCandidatePaths(fileId: string): string[] {
  return LOAD_EXTS.map((ext) => `${ATTACHMENTS_DIR}/${fileId}.${ext}`)
}

export function dataUrlToBytes(dataURL: string): Uint8Array {
  const comma = dataURL.indexOf(',')
  if (comma < 0) throw new Error('Invalid dataURL')
  const header = dataURL.slice(0, comma)
  const payload = dataURL.slice(comma + 1)
  if (header.includes(';base64')) {
    const binary = atob(payload)
    const out = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
    return out
  }
  return new TextEncoder().encode(decodeURIComponent(payload))
}

export function bytesToDataUrl(bytes: Uint8Array, mimeType: string): DataURL {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return `data:${mimeType};base64,${btoa(binary)}` as DataURL
}

export function fileIdsFromElements(elements: readonly unknown[]): string[] {
  const ids = new Set<string>()
  for (const el of elements) {
    if (!el || typeof el !== 'object') continue
    const rec = el as Record<string, unknown>
    if (rec.type !== 'image' || typeof rec.fileId !== 'string' || !rec.fileId) continue
    if (rec.isDeleted === true) continue
    ids.add(rec.fileId)
  }
  return [...ids]
}

export async function ensureAttachmentsDir(): Promise<boolean> {
  if (!dirReady) dirReady = mkdir(ATTACHMENTS_DIR)
  return dirReady
}

export async function persistBinaryFile(file: BinaryFileData): Promise<void> {
  if (!file.dataURL) return
  await ensureAttachmentsDir()
  const bytes = dataUrlToBytes(file.dataURL)
  await writeFile(attachmentFilename(file.id, file.mimeType), bytes)
}

/** Persist any BinaryFiles entries not already marked in `alreadyPersisted`. Mutates the set. */
export async function persistNewBinaryFiles(
  files: BinaryFiles,
  alreadyPersisted: Set<string>
): Promise<void> {
  const pending: BinaryFileData[] = []
  for (const file of Object.values(files)) {
    if (!file?.id || !file.dataURL || alreadyPersisted.has(file.id)) continue
    alreadyPersisted.add(file.id)
    pending.push(file)
  }
  if (pending.length === 0) return
  await Promise.all(
    pending.map((file) =>
      persistBinaryFile(file).catch((err) => {
        alreadyPersisted.delete(file.id)
        console.error('Failed to persist attachment', file.id, err)
      })
    )
  )
}

export async function loadBinaryFiles(fileIds: readonly string[]): Promise<BinaryFileData[]> {
  const out: BinaryFileData[] = []
  await Promise.all(
    fileIds.map(async (id) => {
      for (const path of attachmentCandidatePaths(id)) {
        const bytes = await readFile(path)
        if (!bytes) continue
        const ext = path.slice(path.lastIndexOf('.') + 1)
        const mimeType = extToMime(ext) as BinaryFileData['mimeType']
        out.push({
          id: id as BinaryFileData['id'],
          mimeType,
          dataURL: bytesToDataUrl(bytes, mimeType),
          created: Date.now()
        })
        return
      }
    })
  )
  return out
}
