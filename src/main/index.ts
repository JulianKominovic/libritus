import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, ipcMain, net, protocol, shell } from 'electron'
import { join } from 'path'
import icon from '../../resources/icon.png?asset'
import attachIPCListeners from './listeners'

export const IS_DEV = process.env.NODE_ENV === 'development'
export const APP_ID = IS_DEV ? 'dev.jkominovic.libritus-dev' : 'dev.jkominovic.libritus'
export const APP_DATA_DIR = join(app.getPath('appData'), APP_ID)

let allowQuit = false
let flushingForQuit = false
let quitRequested = false

const FLUSH_QUIT_TIMEOUT_MS = 15_000

function finishQuitOrClose(): void {
  allowQuit = true
  flushingForQuit = false
  if (quitRequested || process.platform !== 'darwin') {
    app.quit()
  } else {
    for (const win of BrowserWindow.getAllWindows()) {
      win.close()
    }
  }
}

function askRendererToFlushBeforeQuit(): void {
  if (flushingForQuit || allowQuit) return
  flushingForQuit = true

  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  if (!win) {
    finishQuitOrClose()
    return
  }

  win.webContents.send('app-quit-request')
  setTimeout(() => {
    if (!allowQuit) finishQuitOrClose()
  }, FLUSH_QUIT_TIMEOUT_MS)
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    title: 'Libritus',
    titleBarStyle: 'hidden',
    titleBarOverlay: false,
    trafficLightPosition: {
      x: 16,
      y: 17
    },
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('close', (e) => {
    if (allowQuit) return
    e.preventDefault()
    askRendererToFlushBeforeQuit()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}
console.log(process.env.NODE_ENV)
// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId(APP_ID)

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  protocol.handle('asset', async (request) => {
    try {
      // Parse the URL to get the pathname
      const url = new URL(request.url)
      const filePath = decodeURIComponent(url.pathname)

      // Create a proper file:// URL
      const fileUrl = `file://${filePath}`
      return await net.fetch(fileUrl)
    } catch (error) {
      console.error('Asset protocol error:', error)
      return new Response('File not found', { status: 404 })
    }
  })

  ipcMain.on('app-quit-ready', () => {
    finishQuitOrClose()
  })

  attachIPCListeners()

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      allowQuit = false
      quitRequested = false
      flushingForQuit = false
      createWindow()
    }
  })
})

app.on('before-quit', (e) => {
  if (allowQuit) return
  e.preventDefault()
  quitRequested = true
  askRendererToFlushBeforeQuit()
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
