import { Readability } from '@mozilla/readability'
import { BrowserWindow, ipcMain, shell } from 'electron'
import fs from 'fs/promises'
import { JSDOM } from 'jsdom'
import path from 'path'
import { APP_DATA_DIR } from '..'
//@ts-expect-error - this is a raw file
import PROSE_CSS_INJECTABLE from '../assets/prose-injectable.css?raw'

const attachIPCListeners = (): void => {
  ipcMain.handle('download-url-as-pdf', async (_, { url }) => {
    // Load the URL in a new window
    const win = new BrowserWindow({ show: false, width: 1920, height: 1080 })
    const timeout = setTimeout(() => win.close(), 30_000)
    try {
      await win.loadURL(url)
      const html = await win.webContents.executeJavaScript('document.documentElement.outerHTML')
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
    await fs.writeFile(fullPath, data)
    return fullPath
  })
  ipcMain.handle('read-file', (_, { filename }) => {
    const fullPath = path.join(APP_DATA_DIR, filename)
    return fs.readFile(fullPath)
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
}
export default attachIPCListeners
