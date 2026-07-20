export type SessionCamera = {
  scrollX: number
  scrollY: number
  zoom: number
}

/** v1 = native PDF page space; v2 = normalized world space (REFERENCE_PAGE_WIDTH). */
export type SessionSnapshot = {
  version: 1 | 2
  docId: string
  updatedAt: string
  camera: SessionCamera
  /** Excalidraw elements (no PDF pages / bitmaps). */
  elements: unknown[]
  appState?: Record<string, unknown>
}

export const SESSION_VERSION = 2 as const

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error'

/** Validate a parsed JSON value as a session snapshot (no I/O). */
export function parseSessionSnapshot(raw: unknown): SessionSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const parsed = raw as Record<string, unknown>
  if (parsed.version !== 1 && parsed.version !== 2) return null
  if (!parsed.camera || typeof parsed.camera !== 'object') return null
  if (!Array.isArray(parsed.elements)) return null
  if (typeof parsed.docId !== 'string') return null
  return parsed as SessionSnapshot
}
