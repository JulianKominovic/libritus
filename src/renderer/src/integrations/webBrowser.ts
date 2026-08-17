export type BrowserShowOpts = {
  url?: string
}

export async function browserShow(opts: BrowserShowOpts = {}): Promise<void> {
  await window.electron.ipcRenderer.invoke('browser:show', opts)
}

export async function browserHide(): Promise<void> {
  await window.electron.ipcRenderer.invoke('browser:hide')
}

export async function browserClose(): Promise<void> {
  await window.electron.ipcRenderer.invoke('browser:close')
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

export type BrowserCaptureTarget = {
  captureId: string | null
  thumbnailDataUrl?: string | null
  title?: string | null
}

export async function browserSetCaptureTarget(target: BrowserCaptureTarget | null): Promise<void> {
  await window.electron.ipcRenderer.invoke('browser:setCaptureTarget', target)
}

export type BrowserCapturedPayload = {
  fileId: string | null
  url: string
  width: number
  height: number
  captureId: string | null
}

export type BrowserPdfSavedPayload = {
  pdfFileId: string
  previewFileId?: string | null
  previewWidth?: number
  previewHeight?: number
  url: string
  title: string
}
