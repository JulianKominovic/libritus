import { safeStorage } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import { APP_DATA_DIR } from '..'

const KEY_REL = path.join('secrets', 'openrouter.key')

function keyPath(): string {
  return path.join(APP_DATA_DIR, KEY_REL)
}

export async function setOpenRouterKey(apiKey: string): Promise<void> {
  const trimmed = apiKey.trim()
  if (!trimmed) throw new Error('API key is empty')
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure storage is not available on this system')
  }
  await fs.mkdir(path.join(APP_DATA_DIR, 'secrets'), { recursive: true })
  const encrypted = safeStorage.encryptString(trimmed)
  await fs.writeFile(keyPath(), encrypted)
}

export async function hasOpenRouterKey(): Promise<boolean> {
  try {
    await fs.access(keyPath())
    return true
  } catch {
    return false
  }
}

export async function clearOpenRouterKey(): Promise<void> {
  try {
    await fs.unlink(keyPath())
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
}

/** Decrypt for main-process OpenRouter calls only. Never send to renderer. */
export async function readOpenRouterKey(): Promise<string | null> {
  try {
    const buf = await fs.readFile(keyPath())
    if (!safeStorage.isEncryptionAvailable()) return null
    return safeStorage.decryptString(buf)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}
