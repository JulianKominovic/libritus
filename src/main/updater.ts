import { app, BrowserWindow, ipcMain } from 'electron'
import type { ProgressInfo, UpdateInfo } from 'electron-updater'

export type UpdateStatus =
  | { phase: 'idle' }
  | { phase: 'available' | 'downloading' | 'ready'; version: string; percent?: number }
  | { phase: 'error'; message: string }

let status: UpdateStatus = { phase: 'idle' }
let lastVersion = ''

/** E2E isolates via LIBRITUS_APP_DATA_DIR — allow injecting updater UI state. */
const e2eHarness = Boolean(process.env.LIBRITUS_APP_DATA_DIR)

function broadcastStatus(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('updater:status', status)
  }
}

function setStatus(next: UpdateStatus): void {
  status = next
  if (next.phase !== 'idle' && next.phase !== 'error') lastVersion = next.version
  broadcastStatus()
}

let autoUpdater: import('electron-updater').AppUpdater | null = null

/** Resolve electron-updater on demand — only packaged builds actually need it. */
async function getAutoUpdater(): Promise<import('electron-updater').AppUpdater> {
  autoUpdater ??= (await import('electron-updater')).autoUpdater
  return autoUpdater
}

export function setupAutoUpdater(opts?: { beforeQuitAndInstall?: () => void }): void {
  ipcMain.handle('updater:get-status', () => status)
  ipcMain.handle('updater:quit-and-install', async () => {
    // Bypass close/before-quit flush preventDefault — caller must flush first.
    opts?.beforeQuitAndInstall?.()
    const updater = await getAutoUpdater()
    updater.quitAndInstall()
  })

  if (e2eHarness) {
    ipcMain.handle('updater:__set-status', (_e, next: UpdateStatus) => {
      setStatus(next)
    })
  }

  // Packaged product only; e2e uses out/main (not packaged) + injects status.
  if (!app.isPackaged || e2eHarness) return

  void getAutoUpdater().then((updater) => {
    // ponytail: Mac needs Developer ID (+ ideally notarize) for trustworthy updates.
    updater.on('update-available', (info: UpdateInfo) => {
      setStatus({ phase: 'available', version: info.version })
    })

    updater.on('download-progress', (p: ProgressInfo) => {
      if (!lastVersion) return
      setStatus({ phase: 'downloading', version: lastVersion, percent: p.percent })
    })

    updater.on('update-downloaded', (info: UpdateInfo) => {
      setStatus({ phase: 'ready', version: info.version })
    })

    updater.on('error', (err: Error) => {
      console.error('auto-update error', err)
      setStatus({ phase: 'error', message: err.message })
    })

    updater.checkForUpdates().catch((err) => {
      console.error('auto-update check failed', err)
    })
  })
}
