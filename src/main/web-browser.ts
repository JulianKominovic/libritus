import { randomUUID } from 'crypto'
import {
  app,
  BrowserWindow,
  ipcMain,
  session,
  shell,
  WebContentsView,
  type Session,
  type WebContents
} from 'electron'
import fs from 'fs/promises'
import path from 'path'
import { APP_DATA_DIR } from '.'
import { chromeLikeUserAgent, isBlockedUrl, isHttpUrl } from './web-browser-url'

export type BrowserBounds = { x: number; y: number; width: number; height: number }

const GUEST_PARTITION = 'persist:web-browser'

type OpenPayload = {
  url: string
  bounds: BrowserBounds
  /** Absolute Chromium zoomFactor (renderer applies userZoom × canvasZoom). */
  zoomFactor?: number
}

/** App window that hosts the PDF canvas. */
let host: BrowserWindow | null = null
/** Guest browser surface — child of host contentView (not a separate BrowserWindow). */
let guest: WebContentsView | null = null
let loadedUrl = ''
/** Deactivate/hide before this timestamp is ignored (open race). */
let ignoreDeactivateUntil = 0
/** Keep in sync with renderer OPEN_GRACE_MS (integrations/webBrowser.ts). */
const OPEN_GRACE_MS = 800
/** Page zoom inside the guest overlay (more layout in the mobile-sized frame). */
const GUEST_ZOOM_FACTOR = 0.8
/**
 * Effective = user × canvasZoom needs headroom beyond user chrome range (0.25–5)
 * so lock-to-card still works when the Excalidraw camera is zoomed in/out.
 */
const EFFECTIVE_ZOOM_MIN = 0.05
const EFFECTIVE_ZOOM_MAX = 50
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
    if (!w.isDestroyed()) {
      host = w
      return w
    }
  }
  return null
}

function guestAlive(): boolean {
  return guest != null && !guest.webContents.isDestroyed()
}

function guestContents(): WebContents | null {
  if (!guestAlive() || !guest) return null
  const wc = guest.webContents
  if (!wc || wc.isDestroyed()) return null
  return wc
}

/** Attach guest to host contentView (reorder to top if already a child). */
function attachGuest(parent: BrowserWindow): void {
  if (!guestAlive() || !guest) return
  parent.contentView.addChildView(guest)
}

/**
 * Tear down guest completely. Only for browser:close / quit — never mid-load.
 * Deactivate must hide only (see browser:deactivate).
 */
function disposeGuest(): void {
  const parent = resolveHost()
  if (parent && !parent.isDestroyed() && guest) {
    try {
      parent.contentView.removeChildView(guest)
    } catch {
      // not attached
    }
  }
  if (guest) {
    const wc = guest.webContents
    if (wc && !wc.isDestroyed()) {
      wc.close()
    }
  }
  guest = null
  loadedUrl = ''
}

function hideGuest(): void {
  if (!guestAlive() || !guest) return
  guest.setVisible(false)
}

function applyBounds(bounds: BrowserBounds): void {
  if (!guestAlive() || !guest) return
  // Renderer sends window-client coords (Excalidraw viewport = contentView space).
  guest.setBounds({
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
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

function setGuestZoomFactor(factor: number): number {
  const wc = guestContents()
  if (!wc) return GUEST_ZOOM_FACTOR
  const clamped = Math.min(EFFECTIVE_ZOOM_MAX, Math.max(EFFECTIVE_ZOOM_MIN, factor))
  wc.setZoomFactor(clamped)
  return getGuestZoomFactor()
}

function notifyZoomStep(delta: number): void {
  resolveHost()?.webContents.send('browser:zoom-step', { delta })
}

function ensureGuest(parent: BrowserWindow): WebContentsView {
  host = parent
  if (guestAlive() && guest) {
    attachGuest(parent)
    return guest
  }

  guest = new WebContentsView({
    webPreferences: {
      session: guestSession(),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  })
  guest.setBorderRadius(12)

  const wc = guest.webContents
  wc.setZoomFactor(GUEST_ZOOM_FACTOR)

  wc.setWindowOpenHandler(({ url }) => {
    if (isHttpUrl(url)) void guestContents()?.loadURL(url)
    return { action: 'deny' }
  })

  wc.on('will-navigate', (event, url) => {
    if (isBlockedUrl(url)) event.preventDefault()
  })

  wc.on('did-navigate', (_e, url) => {
    if (isHttpUrl(url)) loadedUrl = url
  })

  wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame) return
    // -3 ERR_ABORTED is normal for redirects; -2 may be a superseded navigation.
    if (code === -3) return
    console.warn('browser did-fail-load', { code, desc, url })
  })

  wc.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    if (input.key === 'Escape') {
      resolveHost()?.webContents.send('browser:escape')
      return
    }
    if (!(input.meta || input.control)) return
    if (input.key === '+' || input.key === '=' || input.key === 'Add') {
      event.preventDefault()
      // Renderer owns user zoom; host steps userZoom then applies user×canvas.
      notifyZoomStep(1)
      return
    }
    if (input.key === '-' || input.key === '_' || input.key === 'Subtract') {
      event.preventDefault()
      notifyZoomStep(-1)
    }
  })

  wc.on('destroyed', () => {
    guest = null
    loadedUrl = ''
  })

  attachGuest(parent)
  guest.setVisible(false)
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
    const win = resolveHost() ?? BrowserWindow.getAllWindows().find((w) => !w.isDestroyed()) ?? null
    if (!win) throw new Error('No browser window')

    const view = ensureGuest(win)
    const initialZoom =
      typeof payload.zoomFactor === 'number' && Number.isFinite(payload.zoomFactor)
        ? payload.zoomFactor
        : GUEST_ZOOM_FACTOR
    // Silent — renderer owns chrome % (user zoom); this is effective = user × canvas.
    const zoomFactor = setGuestZoomFactor(initialZoom)
    ignoreDeactivateUntil = Date.now() + OPEN_GRACE_MS
    applyBounds(payload.bounds)
    // ponytail: hide-not-detach — never removeChildView mid-load (historical ERR_FAILED).
    view.setVisible(true)
    navigate(payload.url)
    return { ok: true as const, zoomFactor }
  })

  ipcMain.handle('browser:setBounds', (_e, bounds: BrowserBounds) => {
    if (!guestAlive()) return { ok: false as const }
    applyBounds(bounds)
    return { ok: true as const }
  })

  // Absolute effective zoom (user × canvas). Silent — do not spam chrome on pan/zoom sync.
  ipcMain.handle('browser:setZoom', (_e, zoomFactor: number) => {
    if (!guestContents()) return { zoomFactor: GUEST_ZOOM_FACTOR }
    if (typeof zoomFactor !== 'number' || !Number.isFinite(zoomFactor)) {
      return { zoomFactor: getGuestZoomFactor() }
    }
    return { zoomFactor: setGuestZoomFactor(zoomFactor) }
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
    if (!wc || !guestAlive()) {
      hideGuest()
      return { fileId: null as string | null, url: '' }
    }

    let fileId: string | null = null
    let url = ''
    try {
      url = wc.getURL()
    } catch {
      url = ''
    }

    // Capture before hide.
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

    // Hide only — keep attached so the next open does not recreate mid-race.
    hideGuest()
    return { fileId, url: isHttpUrl(url) ? url : '' }
  })

  ipcMain.handle('browser:close', () => {
    disposeGuest()
    return { ok: true as const }
  })
}
