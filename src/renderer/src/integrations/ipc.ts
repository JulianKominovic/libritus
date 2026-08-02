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

/** Main-process fetch for browser image drops (renderer CSP blocks most CDNs). */
export async function fetchImageUrl(
  url: string
): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  const result = (await window.electron.ipcRenderer.invoke('fetch-image-url', { url })) as {
    bytes?: ArrayBuffer | Uint8Array
    mimeType?: string
  } | null
  if (!result?.bytes || typeof result.mimeType !== 'string' || !result.mimeType) return null
  const bytes =
    result.bytes instanceof Uint8Array ? result.bytes : new Uint8Array(result.bytes)
  if (bytes.byteLength === 0) return null
  return { bytes, mimeType: result.mimeType }
}
