import { readFile, writeFile } from '@renderer/integrations/fs'

export type SessionCamera = {
  scrollX: number
  scrollY: number
  zoom: number
}

export type SessionSnapshot = {
  version: 1
  docId: string
  updatedAt: string
  camera: SessionCamera
  /** Excalidraw elements (no PDF pages / bitmaps). */
  elements: unknown[]
  appState?: Record<string, unknown>
}

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error'

function sessionFilename(pdfId: string): string {
  return `${pdfId}.session.json`
}

export async function readSession(pdfId: string): Promise<SessionSnapshot | null> {
  const bytes = await readFile(sessionFilename(pdfId))
  if (!bytes) return null
  try {
    const text = new TextDecoder().decode(bytes)
    const parsed = JSON.parse(text) as SessionSnapshot
    if (parsed?.version !== 1 || !parsed.camera || !Array.isArray(parsed.elements)) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export async function writeSession(pdfId: string, snapshot: SessionSnapshot): Promise<void> {
  const json = JSON.stringify(snapshot)
  await writeFile(sessionFilename(pdfId), new TextEncoder().encode(json))
}
