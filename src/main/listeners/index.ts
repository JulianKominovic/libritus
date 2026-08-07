import { BrowserWindow, ipcMain, net, shell } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import { APP_DATA_DIR } from '..'
import { attachAiIpcListeners } from '../ai'
import { atomicWriteFile } from '../atomicWrite'
import { readBodyCapped } from '../fetchImageBody'
import { setMainLocale, type MainLocale } from '../i18n'
import { attachWebBrowserIpc } from '../web-browser'
import { isHttpUrl } from '../web-browser-url'
//@ts-expect-error - this is a raw file
import PROSE_CSS_INJECTABLE from '../assets/prose-injectable.css?raw'

/** Chrome image drop — keep renderer CSP tight; fetch in main. */
const MAX_FETCH_IMAGE_BYTES = 30 * 1024 * 1024

function isImageMime(contentType: string | null): boolean {
  if (!contentType) return false
  const mime = contentType.split(';')[0]?.trim().toLowerCase() ?? ''
  return mime.startsWith('image/')
}

const attachIPCListeners = (): void => {
  attachAiIpcListeners()
  attachWebBrowserIpc()

  ipcMain.on('app:set-locale', (_event, locale: MainLocale) => {
    setMainLocale(locale)
  })

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
    // Load the URL in a new window
    const win = new BrowserWindow({ show: false, width: 1920, height: 1080 })
    const timeout = setTimeout(() => win.close(), 30_000)
    try {
      await win.loadURL(url)
      const html = await win.webContents.executeJavaScript('document.documentElement.outerHTML')
      // Defer jsdom/readability until article download — keeps cold start lean.
      const [{ JSDOM }, { Readability }] = await Promise.all([
        import('jsdom'),
        import('@mozilla/readability')
      ])
      const dom = new JSDOM(html)
      const document = dom.window.document
      const article = new Readability(document).parse()
      if (!article) throw new Error('No article found')

      const { title, excerpt, byline, content, publishedTime } = article

      await win.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(`
        <html>
          <head>
            <title>${title}</title>
            <meta name="description" content="${excerpt}">
            <meta name="author" content="${byline}">
            <meta name="publishedTime" content="${publishedTime}">
            <style>${PROSE_CSS_INJECTABLE}</style>
          </head>
          <body class="prose" style="margin-inline: auto;">${content}</body>
        </html>`)}`
      )
      const pdfBuffer = await win.webContents.printToPDF({
        printBackground: true,
        displayHeaderFooter: false,
        pageSize: 'A4',
        generateDocumentOutline: true,
        margins: { marginType: 'none' },
        scale: 1.5
      })
      return { buffer: pdfBuffer, title, description: excerpt, author: byline, publishedTime }
    } catch (err) {
      console.error(err)
      return null
    } finally {
      win.close()
      clearTimeout(timeout)
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
