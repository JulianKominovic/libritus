export function downloadUrlAsPdf(url: string) {
  return window.electron.ipcRenderer.invoke('download-url-as-pdf', {
    url
  }) as Promise<{
    buffer: Uint8Array<ArrayBuffer>
    title: string | null
    description: string | null
    author: string | null
    publishedTime: string | null
  } | null>
}
