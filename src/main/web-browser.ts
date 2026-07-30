import { randomUUID } from 'crypto'
import { app, BrowserWindow, ipcMain, session, shell, type Session, type WebContents } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import { APP_DATA_DIR } from '.'
import { chromeLikeUserAgent, isBlockedUrl, isHttpUrl } from './web-browser-url'

export type BrowserBounds = { x: number; y: number; width: number; height: number }

const GUEST_PARTITION = 'persist:web-browser'

type OpenPayload = {
  url: string
  bounds: BrowserBounds
}

/** App window that hosts the PDF canvas — never the guest overlay. */
let host: BrowserWindow | null = null
let guest: BrowserWindow | null = null
let loadedUrl = ''
/** Deactivate/hide before this timestamp is ignored (open race). */
let ignoreDeactivateUntil = 0
/** Keep in sync with renderer OPEN_GRACE_MS (integrations/webBrowser.ts). */
const OPEN_GRACE_MS = 800
/** Page zoom inside the guest overlay (more layout in the mobile-sized frame). */
const GUEST_ZOOM_FACTOR = 0.8
const ZOOM_MIN = 0.25
const ZOOM_MAX = 5
let guestSessionConfigured = false

/**
 * Must run before `app.ready`. Chromium blocks 3P cookies by default
 * (breaks Google login / CAPTCHA / consent in the guest).
 */
export function prepareWebBrowserCookies(): void {
  app.commandLine.appendSwitch(
    'disable-features',
    'BlockThirdPartyCookies,ThirdPartyStoragePartitioning'
  )
}

function guestSession(): Session {
  const ses = session.fromPartition(GUEST_PARTITION)
  if (!guestSessionConfigured) {
    guestSessionConfigured = true
    // Keep Chromium version in sync; only hide the Electron token.
    ses.setUserAgent(chromeLikeUserAgent(ses.getUserAgent()))
    // Sites request this for third-party cookie access (Storage Access API).
    ses.setPermissionRequestHandler((_wc, permission, callback) => {
      if (permission === 'storage-access' || permission === 'top-level-storage-access') {
        callback(true)
        return
      }
      // Guest is a browser surface; deny device / capture APIs only.
      const deny = new Set([
        'media',
        'display-capture',
        'serial',
        'usb',
        'hid',
        'geolocation',
        'midiSysex'
      ])
      callback(!deny.has(permission))
    })
  }
  return ses
}

function resolveHost(): BrowserWindow | null {
  if (host && !host.isDestroyed()) return host
  for (const w of BrowserWindow.getAllWindows()) {
    if (w !== guest && !w.isDestroyed()) {
      host = w
      return w
    }
  }
  return null
}

function guestContents(): WebContents | null {
  if (!guest || guest.isDestroyed()) return null
  const wc = guest.webContents
  if (!wc || wc.isDestroyed()) return null
  return wc
}

function disposeGuest(): void {
  if (guest && !guest.isDestroyed()) {
    guest.destroy()
  }
  guest = null
  loadedUrl = ''
}

function applyBounds(bounds: BrowserBounds): void {
  const parent = resolveHost()
  if (!parent || !guest || guest.isDestroyed()) return
  const origin = parent.getContentBounds()
  guest.setBounds({
    x: Math.round(origin.x + bounds.x),
    y: Math.round(origin.y + bounds.y),
    width: Math.max(1, Math.round(bounds.width)),
    height: Math.max(1, Math.round(bounds.height))
  })
}

function getGuestZoomFactor(): number {
  const wc = guestContents()
  if (!wc) return GUEST_ZOOM_FACTOR
  try {
    return wc.getZoomFactor()
  } catch {
    return GUEST_ZOOM_FACTOR
  }
}

function notifyZoom(zoomFactor: number): void {
  resolveHost()?.webContents.send('browser:zoom', { zoomFactor })
}

function setGuestZoomFactor(factor: number): number {
  const wc = guestContents()
  if (!wc) return GUEST_ZOOM_FACTOR
  const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, factor))
  wc.setZoomFactor(clamped)
  const next = getGuestZoomFactor()
  notifyZoom(next)
  return next
}

/** Chromium-style step: zoomFactor ≈ 1.2^level. */
function zoomGuestBy(deltaLevel: number): number {
  const wc = guestContents()
  if (!wc) return GUEST_ZOOM_FACTOR
  let level: number
  try {
    level = wc.getZoomLevel()
  } catch {
    return GUEST_ZOOM_FACTOR
  }
  wc.setZoomLevel(level + deltaLevel)
  const factor = getGuestZoomFactor()
  if (factor < ZOOM_MIN || factor > ZOOM_MAX) {
    return setGuestZoomFactor(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, factor)))
  }
  notifyZoom(factor)
  return factor
}

function ensureGuest(parent: BrowserWindow): BrowserWindow {
  host = parent
  if (guest && !guest.isDestroyed()) return guest

  // No `parent:` — child windows + focus races aborted loadURL (ERR_FAILED) in-app.
  guest = new BrowserWindow({
    show: false,
    frame: false,
    hasShadow: false,
    roundedCorners: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    autoHideMenuBar: true,
    width: 430,
    height: 930,
    webPreferences: {
      session: guestSession(),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  })

  guest.setMenu(null)
  guest.webContents.setZoomFactor(GUEST_ZOOM_FACTOR)

  guest.webContents.setWindowOpenHandler(({ url }) => {
    if (isHttpUrl(url)) void guestContents()?.loadURL(url)
    return { action: 'deny' }
  })

  guest.webContents.on('will-navigate', (event, url) => {
    if (isBlockedUrl(url)) event.preventDefault()
  })

  guest.webContents.on('did-navigate', (_e, url) => {
    if (isHttpUrl(url)) loadedUrl = url
  })

  guest.webContents.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame) return
    // -3 ERR_ABORTED is normal for redirects; -2 may be a superseded navigation.
    if (code === -3) return
    console.warn('browser did-fail-load', { code, desc, url })
  })

  guest.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    if (input.key === 'Escape') {
      resolveHost()?.webContents.send('browser:escape')
      return
    }
    if (!(input.meta || input.control)) return
    if (input.key === '+' || input.key === '=' || input.key === 'Add') {
      event.preventDefault()
      zoomGuestBy(1)
      return
    }
    if (input.key === '-' || input.key === '_' || input.key === 'Subtract') {
      event.preventDefault()
      zoomGuestBy(-1)
    }
  })

  guest.on('closed', () => {
    guest = null
    loadedUrl = ''
  })

  return guest
}

function navigate(url: string): void {
  const wc = guestContents()
  if (!wc) throw new Error('No guest webContents')

  try {
    const current = wc.getURL()
    if (current === url || loadedUrl === url) return
  } catch {
    // ignore
  }

  loadedUrl = url
  // Prefer event-based completion; loadURL's promise rejects on every redirect.
  void wc.loadURL(url).catch(() => {
    /* did-fail-load / did-navigate handle outcomes */
  })
}

async function persistCapturePng(png: Buffer): Promise<string | null> {
  if (!png.byteLength) return null
  const fileId = randomUUID()
  const dir = path.join(APP_DATA_DIR, 'attachments')
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, `${fileId}.png`), png)
  return fileId
}

export function attachWebBrowserIpc(): void {
  ipcMain.handle('browser:open', async (_e, payload: OpenPayload) => {
    if (!isHttpUrl(payload.url)) throw new Error('Only http(s) URLs are allowed')
    const win = resolveHost() ?? BrowserWindow.getAllWindows().find((w) => w !== guest) ?? null
    if (!win) throw new Error('No browser window')

    const view = ensureGuest(win)
    const zoomFactor = setGuestZoomFactor(GUEST_ZOOM_FACTOR)
    ignoreDeactivateUntil = Date.now() + OPEN_GRACE_MS
    applyBounds(payload.bounds)
    // Keep guest above the host while browsing — chrome clicks focus the host
    // and would otherwise bury this frameless window (no parent:).
    view.setAlwaysOnTop(true, 'floating')
    if (!view.isVisible()) view.showInactive()
    navigate(payload.url)
    return { ok: true as const, zoomFactor }
  })

  ipcMain.handle('browser:setBounds', (_e, bounds: BrowserBounds) => {
    if (!guest || guest.isDestroyed()) return { ok: false as const }
    applyBounds(bounds)
    return { ok: true as const }
  })

  ipcMain.handle('browser:zoomIn', () => {
    if (!guestContents()) return { zoomFactor: GUEST_ZOOM_FACTOR }
    return { zoomFactor: zoomGuestBy(1) }
  })

  ipcMain.handle('browser:zoomOut', () => {
    if (!guestContents()) return { zoomFactor: GUEST_ZOOM_FACTOR }
    return { zoomFactor: zoomGuestBy(-1) }
  })

  ipcMain.handle('browser:getZoom', () => {
    return { zoomFactor: getGuestZoomFactor() }
  })

  ipcMain.handle('browser:goBack', () => {
    const wc = guestContents()
    if (!wc?.navigationHistory.canGoBack()) return { ok: false as const }
    wc.navigationHistory.goBack()
    return { ok: true as const }
  })

  ipcMain.handle('browser:goForward', () => {
    const wc = guestContents()
    if (!wc?.navigationHistory.canGoForward()) return { ok: false as const }
    wc.navigationHistory.goForward()
    return { ok: true as const }
  })

  ipcMain.handle('browser:openExternal', async () => {
    const url = guestContents()?.getURL() ?? ''
    if (!isHttpUrl(url)) return { ok: false as const }
    await shell.openExternal(url)
    return { ok: true as const, url }
  })

  ipcMain.handle('browser:deactivate', async () => {
    if (Date.now() < ignoreDeactivateUntil) {
      return { fileId: null as string | null, url: '', deferred: true as const }
    }

    const wc = guestContents()
    if (!wc || !guest || guest.isDestroyed()) {
      disposeGuest()
      return { fileId: null as string | null, url: '' }
    }

    let fileId: string | null = null
    let url = ''
    try {
      url = wc.getURL()
    } catch {
      url = ''
    }

    // Capture before hide — isVisible can be false after host steals focus on some platforms.
    try {
      const png = (await wc.capturePage()).toPNG({ scaleFactor: 2 })
      fileId = await persistCapturePng(png)
    } catch (err) {
      console.error('browser:deactivate capture failed', err)
    }

    // Persist cookie jar to disk before hide (login / consent survives next open).
    try {
      await wc.session.cookies.flushStore()
    } catch (err) {
      console.warn('browser:deactivate cookie flush failed', err)
    }

    guest.hide()
    guest.setAlwaysOnTop(false)
    return { fileId, url: isHttpUrl(url) ? url : '' }
  })

  ipcMain.handle('browser:close', () => {
    if (guest && !guest.isDestroyed()) guest.setAlwaysOnTop(false)
    disposeGuest()
    return { ok: true as const }
  })
}
