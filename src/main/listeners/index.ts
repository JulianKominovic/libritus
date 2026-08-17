import { BrowserWindow, ipcMain, net, shell } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import { APP_DATA_DIR } from '..'
import { attachAiIpcListeners } from '../ai'
import { atomicWriteFile } from '../atomicWrite'
import { readBodyCapped } from '../fetchImageBody'
import { getMainLocale, setMainLocale, type MainLocale } from '../i18n'
import { attachWebBrowserIpc } from '../web-browser'
import { isHttpUrl, isPdfContentType, isPdfHttpUrl } from '../web-browser-url'

/** Chrome image drop — keep renderer CSP tight; fetch in main. */
const MAX_FETCH_IMAGE_BYTES = 30 * 1024 * 1024
const MAX_PDF_BYTES = MAX_FETCH_IMAGE_BYTES
const PRINT_TIMEOUT_MS = 5 * 60 * 1000

function isImageMime(contentType: string | null): boolean {
  if (!contentType) return false
  const mime = contentType.split(';')[0]?.trim().toLowerCase() ?? ''
  return mime.startsWith('image/')
}

function pdfTitleFromUrl(url: string): string {
  try {
    const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || '')
    return name.replace(/\.pdf$/i, '') || 'PDF'
  } catch {
    return 'PDF'
  }
}

async function fetchPdfBuffer(url: string): Promise<Buffer | null> {
  const res = await net.fetch(url)
  if (!res.ok) return null
  const buf = await readBodyCapped(res.body, MAX_PDF_BYTES, res.headers.get('content-length'))
  if (!buf) return null
  if (buf.subarray(0, 5).toString() !== '%PDF-') return null
  return buf
}

async function headSaysPdf(url: string): Promise<boolean> {
  try {
    const res = await net.fetch(url, { method: 'HEAD' })
    if (!res.ok) return false
    return isPdfContentType(res.headers.get('content-type'))
  } catch {
    return false
  }
}

async function printUrlAsPdf(url: string): Promise<{ buffer: Buffer; title: string | null } | null> {
  const win = new BrowserWindow({ show: false, width: 1920, height: 1080 })
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    if (!win.isDestroyed()) win.destroy()
  }, PRINT_TIMEOUT_MS)
  try {
    await win.loadURL(url)
    if (timedOut || win.isDestroyed()) return null
    const pdfBuffer = await win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true
    })
    if (timedOut || win.isDestroyed()) return null
    return { buffer: pdfBuffer, title: win.webContents.getTitle() || null }
  } catch (err) {
    console.error(err)
    return null
  } finally {
    clearTimeout(timeout)
    if (!win.isDestroyed()) win.destroy()
  }
}

const attachIPCListeners = (): void => {
  attachAiIpcListeners()
  attachWebBrowserIpc()

  ipcMain.on('app:set-locale', (_event, locale: MainLocale) => {
    setMainLocale(locale)
  })
  ipcMain.handle('app:get-locale', () => getMainLocale())

  ipcMain.handle('fetch-image-url', async (_, { url }: { url: string }) => {
    if (typeof url !== 'string' || !isHttpUrl(url)) return null
    try {
      const res = await net.fetch(url)
      if (!res.ok) return null
      const mimeType = res.headers.get('content-type')
      if (!isImageMime(mimeType)) return null
      const buf = await readBodyCapped(
        res.body,
        MAX_FETCH_IMAGE_BYTES,
        res.headers.get('content-length')
      )
      if (!buf) return null
      return {
        bytes: buf,
        mimeType: mimeType!.split(';')[0]!.trim().toLowerCase()
      }
    } catch (err) {
      console.error('fetch-image-url failed', url, err)
      return null
    }
  })

  ipcMain.handle('download-url-as-pdf', async (_, { url }) => {
    if (typeof url !== 'string' || !isHttpUrl(url)) return null
    try {
      const shouldFetch = isPdfHttpUrl(url) || (await headSaysPdf(url))
      if (shouldFetch) {
        const buffer = await fetchPdfBuffer(url)
        if (!buffer) return null
        return { buffer, title: pdfTitleFromUrl(url) }
      }
      return await printUrlAsPdf(url)
    } catch (err) {
      console.error(err)
      return null
    }
  })
  ipcMain.handle('open-path', (_, { path }) => {
    return shell.openPath(path)
  })
  ipcMain.handle('open-app-data-dir', () => {
    return shell.openPath(APP_DATA_DIR)
  })
  ipcMain.handle('get-app-data-dir', () => {
    return APP_DATA_DIR
  })
  ipcMain.handle('write-file', async (_, { filename, data }) => {
    const fullPath = path.join(APP_DATA_DIR, filename)
    await atomicWriteFile(fullPath, data)
    return fullPath
  })
  ipcMain.handle('read-file', async (_, { filename }) => {
    const fullPath = path.join(APP_DATA_DIR, filename)
    try {
      return await fs.readFile(fullPath)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw err
    }
  })
  ipcMain.handle('exists-file', (_, { filename }) => {
    return fs
      .access(path.join(APP_DATA_DIR, filename))
      .then(() => true)
      .catch(() => false)
  })
  ipcMain.handle('mkdir', (_, { filename }) => {
    return fs
      .mkdir(path.join(APP_DATA_DIR, filename), { recursive: true })
      .then(() => true)
      .catch(() => false)
  })
  ipcMain.handle(
    'window:set-title-bar-overlay',
    (event, opts: { color: string; symbolColor: string }) => {
      if (process.platform === 'darwin') return
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return
      win.setTitleBarOverlay({
        color: opts.color,
        symbolColor: opts.symbolColor,
        height: 32
      })
    }
  )
}
export default attachIPCListeners
