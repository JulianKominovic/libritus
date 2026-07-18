import { readFile, writeFile } from '@renderer/integrations/fs'
import {
  parseSessionSnapshot,
  type SaveStatus,
  type SessionCamera,
  type SessionSnapshot
} from './sessionTypes'

export type { SaveStatus, SessionCamera, SessionSnapshot }
export { parseSessionSnapshot } from './sessionTypes'

function sessionFilename(pdfId: string): string {
  return `${pdfId}.session.json`
}

export async function readSession(pdfId: string): Promise<SessionSnapshot | null> {
  const bytes = await readFile(sessionFilename(pdfId))
  if (!bytes) return null
  try {
    const text = new TextDecoder().decode(bytes)
    return parseSessionSnapshot(JSON.parse(text) as unknown)
  } catch {
    return null
  }
}

export async function writeSession(pdfId: string, snapshot: SessionSnapshot): Promise<void> {
  const json = JSON.stringify(snapshot)
  await writeFile(sessionFilename(pdfId), new TextEncoder().encode(json))
}
