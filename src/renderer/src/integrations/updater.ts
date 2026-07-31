export type UpdateStatus =
  | { phase: 'idle' }
  | { phase: 'available' | 'downloading' | 'ready'; version: string; percent?: number }
  | { phase: 'error'; message: string }

export async function getUpdateStatus(): Promise<UpdateStatus> {
  return window.electron.ipcRenderer.invoke('updater:get-status')
}

export async function quitAndInstall(): Promise<void> {
  await window.electron.ipcRenderer.invoke('updater:quit-and-install')
}

export function onUpdateStatus(handler: (status: UpdateStatus) => void): () => void {
  return window.electron.ipcRenderer.on('updater:status', (_e, payload) => handler(payload))
}
