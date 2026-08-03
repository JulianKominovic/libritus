export type BrowserBounds = { x: number; y: number; width: number; height: number }

/** Keep in sync with src/main/web-browser.ts OPEN_GRACE_MS. */
export const OPEN_GRACE_MS = 800

function readZoomFactor(result: unknown): number {
  const z = (result as { zoomFactor?: unknown } | null)?.zoomFactor
  return typeof z === 'number' && Number.isFinite(z) ? z : 0.8
}

export async function browserOpen(
  url: string,
  bounds: BrowserBounds,
  zoomFactor?: number
): Promise<number> {
  const result = await window.electron.ipcRenderer.invoke('browser:open', {
    url,
    bounds,
    zoomFactor
  })
  return readZoomFactor(result)
}

export async function browserSetBounds(bounds: BrowserBounds): Promise<void> {
  await window.electron.ipcRenderer.invoke('browser:setBounds', bounds)
}

export async function browserSetZoom(zoomFactor: number): Promise<number> {
  return readZoomFactor(await window.electron.ipcRenderer.invoke('browser:setZoom', zoomFactor))
}

export async function browserGoBack(): Promise<void> {
  await window.electron.ipcRenderer.invoke('browser:goBack')
}

export async function browserGoForward(): Promise<void> {
  await window.electron.ipcRenderer.invoke('browser:goForward')
}

export async function browserOpenExternal(): Promise<void> {
  await window.electron.ipcRenderer.invoke('browser:openExternal')
}

export async function browserDeactivate(): Promise<{
  fileId: string | null
  url: string
  deferred?: boolean
}> {
  const result = await window.electron.ipcRenderer.invoke('browser:deactivate')
  return {
    fileId: typeof result?.fileId === 'string' && result.fileId ? result.fileId : null,
    url: typeof result?.url === 'string' ? result.url : '',
    deferred: result?.deferred === true
  }
}

export async function browserClose(): Promise<void> {
  await window.electron.ipcRenderer.invoke('browser:close')
}
