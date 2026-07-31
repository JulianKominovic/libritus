import { app } from 'electron'
import { autoUpdater } from 'electron-updater'

export function setupAutoUpdater(): void {
  if (!app.isPackaged) return
  // ponytail: Mac needs Developer ID (+ ideally notarize) for trustworthy updates.
  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    console.error('auto-update check failed', err)
  })
}
