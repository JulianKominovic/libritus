import { is } from '@electron-toolkit/utils'
import { randomUUID } from 'crypto'
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  session,
  shell,
  WebContentsView,
  type ContextMenuParams,
  type Input,
  type MenuItemConstructorOptions,
  type NativeImage,
  type Session,
  type WebContents
} from 'electron'
import fs from 'fs'
import fsPromises from 'fs/promises'
import path from 'path'
import { pathToFileURL } from 'url'
import { APP_DATA_DIR, isAppQuitting } from '.'
import { readBodyCapped } from './fetchImageBody'
import { tMenu } from './i18n'
import {
  chromeLikeUserAgent,
  isBlockedUrl,
  isHttpUrl,
  isPdfHttpUrl,
  normalizeNavigateUrl
} from './web-browser-url'

const GUEST_PARTITION = 'persist:web-browser'
const DEFAULT_URL = 'https://www.google.com'
const NAV_H = 50
const ACTIONS_BOTTOM_INSET = 16
const ACTIONS_SHADOW_PAD = 12
const DEFAULT_ACTIONS_W = 280
const DEFAULT_ACTIONS_H = 52
const MAX_PDF_BYTES = 30 * 1024 * 1024
const GUEST_ZOOM_MIN = 0.25
const GUEST_ZOOM_MAX = 5
const GUEST_ZOOM_STEP = 1.2

type ShowPayload = {
  url?: string
}

type CaptureTargetPayload = {
  captureId: string | null
  thumbnailDataUrl?: string | null
  title?: string | null
}

/** App window that hosts the PDF canvas. */
let host: BrowserWindow | null = null
let browserWin: BrowserWindow | null = null
let guest: WebContentsView | null = null
let actions: WebContentsView | null = null
let actionsSize = { width: DEFAULT_ACTIONS_W, height: DEFAULT_ACTIONS_H }
let loadedUrl = ''
/** Canvas search-capture id for Update capture; null → Update button hidden. */
let sourceCaptureId: string | null = null
let sourceCaptureThumb: string | null = null
let sourceCaptureTitle: string | null = null
let guestSessionConfigured = false
let downloadHandlerAttached = false
/** True while `new BrowserWindow` runs — `browserWin` is not assigned yet. */
let attachingBrowserWindow = false

export function isWebBrowserWindow(w: BrowserWindow): boolean {
  return browserWin != null && !browserWin.isDestroyed() && w.id === browserWin.id
}

export function isAttachingWebBrowserWindow(): boolean {
  return attachingBrowserWindow
}

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
    ses.setUserAgent(chromeLikeUserAgent(ses.getUserAgent()))
    ses.setPermissionRequestHandler((_wc, permission, callback) => {
      if (permission === 'storage-access' || permission === 'top-level-storage-access') {
        callback(true)
        return
      }
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
    attachPdfDownloadInterceptor(ses)
  }
  return ses
}

function attachPdfDownloadInterceptor(ses: Session): void {
  if (downloadHandlerAttached) return
  downloadHandlerAttached = true
  ses.on('will-download', (_event, item) => {
    const mime = (item.getMimeType() || '').toLowerCase()
    const name = (item.getFilename() || '').toLowerCase()
    if (!mime.includes('pdf') && !name.endsWith('.pdf')) return
    const total = item.getTotalBytes()
    if (total > MAX_PDF_BYTES) {
      item.cancel()
      return
    }
    const fileId = randomUUID()
    const dest = path.join(APP_DATA_DIR, 'attachments', `${fileId}.pdf`)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    item.setSavePath(dest)
    item.on('updated', () => {
      if (item.getReceivedBytes() > MAX_PDF_BYTES) item.cancel()
    })
    item.once('done', (_e, state) => {
      if (state !== 'completed') return
      sendToHost('browser:pdf-saved', {
        pdfFileId: fileId,
        url: item.getURL(),
        title: item.getFilename() || 'PDF'
      })
    })
  })
}

function resolveHost(): BrowserWindow | null {
  if (host && !host.isDestroyed() && !isWebBrowserWindow(host)) return host
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed() && !isWebBrowserWindow(w)) {
      host = w
      return w
    }
  }
  return null
}

function sendToHost(channel: string, payload: unknown): void {
  resolveHost()?.webContents.send(channel, payload)
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

function browserUiUrl(): string {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    return `${process.env['ELECTRON_RENDERER_URL']}/browser-ui.html`
  }
  return pathToFileURL(path.join(__dirname, '../renderer/browser-ui.html')).href
}

function chromeAlive(): boolean {
  return browserWin != null && !browserWin.isDestroyed() && !browserWin.webContents.isDestroyed()
}

function actionsAlive(): boolean {
  return actions != null && !actions.webContents.isDestroyed()
}

function sendToChrome(channel: string, payload?: unknown): void {
  const targets: WebContents[] = []
  if (chromeAlive() && browserWin) targets.push(browserWin.webContents)
  if (actionsAlive() && actions) targets.push(actions.webContents)
  for (const wc of targets) {
    if (payload === undefined) wc.send(channel)
    else wc.send(channel, payload)
  }
}

function layoutBrowserChrome(): void {
  if (!browserWin || browserWin.isDestroyed()) return
  const [w, h] = browserWin.getContentSize()
  if (guestAlive() && guest) {
    guest.setBounds({
      x: 0,
      y: NAV_H,
      width: Math.max(1, w),
      height: Math.max(1, h - NAV_H)
    })
  }
  if (actionsAlive() && actions) {
    const aw = Math.max(1, Math.min(w, actionsSize.width + ACTIONS_SHADOW_PAD * 2))
    const ah = Math.max(1, Math.min(h - NAV_H, actionsSize.height + ACTIONS_SHADOW_PAD * 2))
    actions.setBounds({
      x: Math.max(0, Math.round((w - aw) / 2)),
      y: Math.max(NAV_H, h - ah - ACTIONS_BOTTOM_INSET),
      width: aw,
      height: ah
    })
  }
}

function pushTargetState(): void {
  sendToChrome(
    'browser-ui:target',
    sourceCaptureId
      ? {
          captureId: sourceCaptureId,
          thumbnailDataUrl: sourceCaptureThumb,
          title: sourceCaptureTitle
        }
      : null
  )
}

function setCaptureTarget(payload: CaptureTargetPayload | null): void {
  if (!payload || !payload.captureId) {
    sourceCaptureId = null
    sourceCaptureThumb = null
    sourceCaptureTitle = null
  } else {
    sourceCaptureId = payload.captureId
    sourceCaptureThumb =
      typeof payload.thumbnailDataUrl === 'string' && payload.thumbnailDataUrl.startsWith('data:')
        ? payload.thumbnailDataUrl
        : null
    sourceCaptureTitle = typeof payload.title === 'string' ? payload.title : null
  }
  pushTargetState()
}

function resetGuestZoom(wc: WebContents): void {
  try {
    wc.setZoomFactor(1)
    // Habilitar este zoom visual genera bugs visuales. NO HABILITARLO.
    // wc.setVisualZoomLevelLimits(GUEST_ZOOM_MIN, GUEST_ZOOM_MAX)
  } catch {
    /* destroyed */
  }
}

function stepGuestZoom(wc: WebContents, deltaLevel: number): void {
  try {
    const next = Math.min(
      GUEST_ZOOM_MAX,
      Math.max(GUEST_ZOOM_MIN, wc.getZoomFactor() * Math.pow(GUEST_ZOOM_STEP, deltaLevel))
    )
    wc.setZoomFactor(next)
  } catch {
    /* destroyed */
  }
}

function pushNavState(): void {
  const wc = guestContents()
  if (!wc || !chromeAlive()) return
  let url = ''
  try {
    url = wc.getURL()
  } catch {
    url = ''
  }
  const hist = wc.navigationHistory
  sendToChrome('browser-ui:nav', {
    url: isHttpUrl(url) ? url : '',
    canGoBack: hist.canGoBack(),
    canGoForward: hist.canGoForward()
  })
  if (browserWin && !browserWin.isDestroyed()) {
    try {
      const title = wc.getTitle()
      if (title) browserWin.setTitle(title)
    } catch {
      /* destroyed */
    }
  }
}

function hideBrowserWindow(): void {
  const wc = guestContents()
  if (wc && !wc.isDestroyed()) wc.setAudioMuted(true)
  if (browserWin && !browserWin.isDestroyed() && browserWin.isVisible()) {
    browserWin.hide()
  }
}

function disposeBrowserWindow(): void {
  // Keep sourceCaptureId / thumb / title — setCaptureTarget owns those; recreate
  // must not wipe Update target (openSearchBrowser sets target before show).
  loadedUrl = ''
  actionsSize = { width: DEFAULT_ACTIONS_W, height: DEFAULT_ACTIONS_H }
  if (guest && !guest.webContents.isDestroyed()) {
    try {
      guest.webContents.close()
    } catch {
      /* ignore */
    }
  }
  guest = null
  if (actions && !actions.webContents.isDestroyed()) {
    try {
      actions.webContents.close()
    } catch {
      /* ignore */
    }
  }
  actions = null
  if (browserWin && !browserWin.isDestroyed()) {
    browserWin.removeAllListeners('close')
    browserWin.destroy()
  }
  browserWin = null
}

async function persistBytes(bytes: Buffer, ext: 'png' | 'pdf'): Promise<string | null> {
  if (!bytes.byteLength) return null
  const fileId = randomUUID()
  const dir = path.join(APP_DATA_DIR, 'attachments')
  await fsPromises.mkdir(dir, { recursive: true })
  await fsPromises.writeFile(path.join(dir, `${fileId}.${ext}`), bytes)
  return fileId
}

/** Save guest image via http(s) or data: — blob: is copy-only (copyImageAt). */
async function saveGuestImage(wc: WebContents, srcURL: string): Promise<void> {
  const win = browserWin
  if (!win || win.isDestroyed() || wc.isDestroyed()) return

  let name = 'image.png'
  try {
    const base = path.basename(new URL(srcURL).pathname)
    if (base.includes('.')) name = base
  } catch {
    // keep default
  }

  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: name,
    filters: [
      { name: tMenu('imagesFilter'), extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] }
    ]
  })
  if (canceled || !filePath || wc.isDestroyed()) return

  if (srcURL.startsWith('data:')) {
    const m = /^data:[^;]+;base64,(.+)$/i.exec(srcURL)
    if (!m) return
    await fsPromises.writeFile(filePath, Buffer.from(m[1], 'base64'))
    return
  }

  if (!isHttpUrl(srcURL)) return
  const res = await wc.session.fetch(srcURL)
  if (!res.ok) throw new Error(`save image failed: ${res.status}`)
  await fsPromises.writeFile(filePath, Buffer.from(await res.arrayBuffer()))
}

function popupGuestContextMenu(wc: WebContents, params: ContextMenuParams): void {
  const win = browserWin
  if (!win || win.isDestroyed()) return

  const alive = (): boolean => !wc.isDestroyed()
  const hist = wc.navigationHistory
  const items: MenuItemConstructorOptions[] = [
    {
      label: tMenu('back'),
      enabled: hist.canGoBack(),
      click: () => {
        if (alive()) hist.goBack()
      }
    },
    {
      label: tMenu('forward'),
      enabled: hist.canGoForward(),
      click: () => {
        if (alive()) hist.goForward()
      }
    },
    {
      label: tMenu('reload'),
      click: () => {
        if (alive()) wc.reload()
      }
    },
    { type: 'separator' }
  ]

  if (params.selectionText.trim()) {
    items.push({
      label: tMenu('copy'),
      click: () => clipboard.writeText(params.selectionText)
    })
  }

  if (params.linkURL) {
    items.push(
      {
        label: tMenu('openLink'),
        enabled: isHttpUrl(params.linkURL),
        click: () => {
          if (alive() && isHttpUrl(params.linkURL)) void wc.loadURL(params.linkURL)
        }
      },
      {
        label: tMenu('copyLink'),
        click: () => clipboard.writeText(params.linkURL)
      }
    )
  }

  if (params.mediaType === 'image' && params.srcURL) {
    const canSave = isHttpUrl(params.srcURL) || params.srcURL.startsWith('data:')
    items.push(
      {
        label: tMenu('copyImage'),
        click: () => {
          if (alive()) wc.copyImageAt(params.x, params.y)
        }
      },
      {
        label: tMenu('copyImageAddress'),
        click: () => clipboard.writeText(params.srcURL)
      },
      {
        label: tMenu('saveImageAs'),
        enabled: canSave,
        click: () => {
          if (!alive()) return
          void saveGuestImage(wc, params.srcURL).catch((err) =>
            console.error('guest save image failed', err)
          )
        }
      }
    )
  }

  if (params.isEditable) {
    items.push(
      { type: 'separator' },
      {
        label: tMenu('cut'),
        enabled: params.editFlags.canCut,
        click: () => {
          if (alive()) wc.cut()
        }
      },
      {
        label: tMenu('copy'),
        enabled: params.editFlags.canCopy,
        click: () => {
          if (alive()) wc.copy()
        }
      },
      {
        label: tMenu('paste'),
        enabled: params.editFlags.canPaste,
        click: () => {
          if (alive()) wc.paste()
        }
      },
      {
        label: tMenu('selectAll'),
        enabled: params.editFlags.canSelectAll,
        click: () => {
          if (alive()) wc.selectAll()
        }
      }
    )
  }

  items.push(
    { type: 'separator' },
    {
      label: tMenu('openInSystemBrowser'),
      click: () => {
        if (!alive()) return
        try {
          const url = wc.getURL()
          if (isHttpUrl(url)) void shell.openExternal(url)
        } catch {
          // destroyed mid-popup
        }
      }
    }
  )

  Menu.buildFromTemplate(items).popup({ window: win })
}

function wireGuest(wc: WebContents): void {
  wc.setWindowOpenHandler(({ url }) => {
    if (isHttpUrl(url)) void guestContents()?.loadURL(url)
    return { action: 'deny' }
  })

  wc.on('will-navigate', (event, url) => {
    if (isBlockedUrl(url)) event.preventDefault()
  })

  wc.on('did-navigate', (_e, url) => {
    if (isHttpUrl(url)) loadedUrl = url
    pushNavState()
  })
  wc.on('did-navigate-in-page', () => pushNavState())
  wc.on('did-finish-load', () => {
    resetGuestZoom(wc)
    pushNavState()
  })
  wc.on('page-title-updated', () => pushNavState())

  wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame) return
    if (code === -3) return
    console.warn('browser did-fail-load', { code, desc, url })
  })

  wc.on('before-input-event', (event, input) => {
    handleBrowserShortcut(event, input)
  })

  wc.on('context-menu', (_e, params) => {
    popupGuestContextMenu(wc, params)
  })

  wc.on('destroyed', () => {
    guest = null
    loadedUrl = ''
  })
}

function isAllowedChromeUrl(url: string): boolean {
  try {
    const u = new URL(url)
    const expected = new URL(browserUiUrl())
    if (u.protocol !== expected.protocol) return false
    if (u.protocol === 'file:') {
      return (
        path.normalize(decodeURIComponent(u.pathname)) ===
        path.normalize(decodeURIComponent(expected.pathname))
      )
    }
    return u.origin === expected.origin && u.pathname === expected.pathname
  } catch {
    return false
  }
}

function handleBrowserShortcut(event: { preventDefault: () => void }, input: Input): void {
  if (input.type !== 'keyDown') return
  const mod = input.meta || input.control
  if (mod && input.key.toLowerCase() === 'l') {
    event.preventDefault()
    if (chromeAlive() && browserWin) {
      browserWin.webContents.focus()
      sendToChrome('browser-ui:focus-url')
    }
    return
  }
  if (!mod) return
  const guestWc = guestContents()
  if (!guestWc) return
  const key = input.key
  // Chromium zoom: Cmd/Ctrl + / - / 0 (and numpad equivalents). Always the guest.
  if (key === '=' || key === '+' || key === 'Add') {
    event.preventDefault()
    stepGuestZoom(guestWc, 1)
    return
  }
  if (key === '-' || key === '_' || key === 'Subtract') {
    event.preventDefault()
    stepGuestZoom(guestWc, -1)
    return
  }
  if (key === '0' || key === 'Digit0' || key === 'Numpad0') {
    event.preventDefault()
    resetGuestZoom(guestWc)
  }
}

/** Chrome shares the app preload — never let it navigate to a remote origin. */
function lockChromeContents(wc: WebContents): void {
  wc.setWindowOpenHandler(() => ({ action: 'deny' }))
  const block = (event: { preventDefault: () => void }, url: string) => {
    if (!isAllowedChromeUrl(url)) event.preventDefault()
  }
  wc.on('will-navigate', block)
  wc.on('will-redirect', block)
  wc.on('will-attach-webview', (event) => event.preventDefault())
}

function ensureBrowserWindow(): BrowserWindow {
  if (browserWin && !browserWin.isDestroyed() && guestAlive() && actionsAlive()) {
    return browserWin
  }

  disposeBrowserWindow()

  attachingBrowserWindow = true
  try {
    browserWin = new BrowserWindow({
      width: 1100,
      height: 800,
      minWidth: 640,
      minHeight: 480,
      show: false,
      title: 'Libritus',
      titleBarStyle: 'hidden',
      autoHideMenuBar: true,
      backgroundColor: '#ebebeb',
      ...(process.platform === 'darwin'
        ? { trafficLightPosition: { x: 16, y: 17 } }
        : {
            titleBarOverlay: {
              color: '#ebebeb',
              symbolColor: '#2f2f2f',
              height: 32
            }
          }),
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false
      }
    })
  } finally {
    attachingBrowserWindow = false
  }

  lockChromeContents(browserWin.webContents)
  browserWin.webContents.on('did-finish-load', () => {
    pushTargetState()
    pushNavState()
  })
  browserWin.webContents.on('before-input-event', (event, input) => {
    handleBrowserShortcut(event, input)
  })
  void browserWin.webContents.loadURL(browserUiUrl())

  browserWin.on('close', (e) => {
    if (isAppQuitting()) return
    e.preventDefault()
    hideBrowserWindow()
  })

  browserWin.on('resize', () => layoutBrowserChrome())
  browserWin.on('show', () => {
    const wc = guestContents()
    if (wc && !wc.isDestroyed()) wc.setAudioMuted(false)
    layoutBrowserChrome()
  })

  guest = new WebContentsView({
    webPreferences: {
      session: guestSession(),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      disableHtmlFullscreenWindowResize: true,
      zoomFactor: 1.0
    }
  })
  wireGuest(guest.webContents)
  resetGuestZoom(guest.webContents)

  actions = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  actions.setBackgroundColor('#00000000')
  lockChromeContents(actions.webContents)
  actions.webContents.on('did-finish-load', () => {
    pushTargetState()
  })
  actions.webContents.on('before-input-event', (event, input) => {
    handleBrowserShortcut(event, input)
  })
  void actions.webContents.loadURL(`${browserUiUrl()}?panel=actions`)

  browserWin.contentView.addChildView(guest)
  browserWin.contentView.addChildView(actions)
  layoutBrowserChrome()
  return browserWin
}

function guestIsBlank(): boolean {
  const wc = guestContents()
  if (!wc) return true
  try {
    const url = wc.getURL()
    return !url || url === 'about:blank' || url === ''
  } catch {
    return true
  }
}

function navigate(url: string): void {
  const wc = guestContents()
  if (!wc) throw new Error('No guest webContents')

  try {
    const current = wc.getURL()
    if (current === url && loadedUrl === url) return
  } catch {
    // ignore
  }

  loadedUrl = url
  void wc.loadURL(url).catch(() => {
    /* did-fail-load / did-navigate handle outcomes */
  })
}

async function capturePagePayload(captureId: string | null): Promise<{
  fileId: string | null
  url: string
  width: number
  height: number
  captureId: string | null
}> {
  const wc = guestContents()
  if (!wc) {
    return { fileId: null, url: '', width: 0, height: 0, captureId }
  }
  let url = ''
  try {
    url = wc.getURL()
  } catch {
    url = ''
  }
  const image = await wc.capturePage()
  const size = image.getSize()
  const png = image.toPNG({ scaleFactor: 2 })
  const fileId = await persistBytes(png, 'png')
  const payload = {
    fileId,
    url: isHttpUrl(url) ? url : '',
    width: size.width,
    height: size.height,
    captureId
  }
  sendToHost('browser:captured', payload)
  return payload
}

/** Always adds a new card on the canvas. */
async function captureNow(): Promise<{
  fileId: string | null
  url: string
  width: number
  height: number
  captureId: string | null
}> {
  return capturePagePayload(null)
}

/** Replaces the selected search-capture card; no-op without a target. */
async function updateNow(): Promise<{
  fileId: string | null
  url: string
  width: number
  height: number
  captureId: string | null
  ok: boolean
}> {
  if (!sourceCaptureId) {
    return { fileId: null, url: '', width: 0, height: 0, captureId: null, ok: false }
  }
  const payload = await capturePagePayload(sourceCaptureId)
  return { ...payload, ok: Boolean(payload.fileId) }
}

async function fetchPdfBytes(wc: WebContents, url: string): Promise<Buffer | null> {
  try {
    const res = await wc.session.fetch(url)
    if (!res.ok) return null
    const buf = await readBodyCapped(res.body, MAX_PDF_BYTES, res.headers.get('content-length'))
    if (!buf) return null
    if (buf.subarray(0, 5).toString() === '%PDF-') return buf
    return null
  } catch {
    return null
  }
}

async function savePdfNow(): Promise<{ ok: boolean }> {
  const wc = guestContents()
  if (!wc) return { ok: false }
  let url = ''
  let title = 'PDF'
  try {
    url = wc.getURL()
    title = wc.getTitle() || title
  } catch {
    /* ignore */
  }

  let previewImage: NativeImage | null = null
  try {
    previewImage = await wc.capturePage()
  } catch (err) {
    console.warn('browser savePdf preview capture failed', err)
  }

  let pdf: Buffer | null = null
  if (isPdfHttpUrl(url)) {
    pdf = await fetchPdfBytes(wc, url)
  }
  if (!pdf) {
    try {
      pdf = Buffer.from(
        await wc.printToPDF({
          printBackground: true,
          preferCSSPageSize: true
        })
      )
    } catch (err) {
      console.warn('browser printToPDF failed', err)
      return { ok: false }
    }
  }
  if (!pdf.byteLength || pdf.byteLength > MAX_PDF_BYTES) return { ok: false }

  const pdfFileId = await persistBytes(pdf, 'pdf')
  if (!pdfFileId) return { ok: false }

  let previewFileId: string | null = null
  let previewWidth = 0
  let previewHeight = 0
  if (previewImage && !previewImage.isEmpty()) {
    const size = previewImage.getSize()
    previewFileId = await persistBytes(previewImage.toPNG({ scaleFactor: 2 }), 'png')
    previewWidth = size.width
    previewHeight = size.height
  }

  sendToHost('browser:pdf-saved', {
    pdfFileId,
    previewFileId,
    previewWidth,
    previewHeight,
    url: isHttpUrl(url) ? url : '',
    title
  })
  return { ok: true }
}

export function attachWebBrowserIpc(): void {
  ipcMain.handle('browser:show', (_e, payload: ShowPayload = {}) => {
    const win = ensureBrowserWindow()

    const nextUrl =
      typeof payload.url === 'string' && isHttpUrl(payload.url)
        ? payload.url
        : guestIsBlank()
          ? DEFAULT_URL
          : null
    if (nextUrl) navigate(nextUrl)

    win.show()
    win.focus()
    const wc = guestContents()
    if (wc && !wc.isDestroyed()) {
      wc.setAudioMuted(false)
      resetGuestZoom(wc)
    }
    layoutBrowserChrome()
    pushTargetState()
    return { ok: true as const }
  })

  ipcMain.handle('browser:setCaptureTarget', (_e, payload: CaptureTargetPayload | null) => {
    setCaptureTarget(payload)
    return { ok: true as const }
  })

  ipcMain.handle('browser:hide', () => {
    hideBrowserWindow()
    return { ok: true as const }
  })

  ipcMain.handle('browser:close', () => {
    setCaptureTarget(null)
    disposeBrowserWindow()
    return { ok: true as const }
  })

  ipcMain.handle('browser:isVisible', () => {
    return {
      visible: Boolean(browserWin && !browserWin.isDestroyed() && browserWin.isVisible())
    }
  })

  ipcMain.handle('browser:getCaptureTarget', () => {
    return sourceCaptureId
      ? {
          captureId: sourceCaptureId,
          thumbnailDataUrl: sourceCaptureThumb,
          title: sourceCaptureTitle
        }
      : { captureId: null }
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

  ipcMain.handle('browser:navigate', (_e, raw: unknown) => {
    const url = typeof raw === 'string' ? normalizeNavigateUrl(raw) : null
    if (!url) return { ok: false as const }
    if (!guestAlive()) ensureBrowserWindow()
    navigate(url)
    return { ok: true as const, url }
  })

  ipcMain.handle('browser:openExternal', async () => {
    const url = guestContents()?.getURL() ?? ''
    if (!isHttpUrl(url)) return { ok: false as const }
    await shell.openExternal(url)
    return { ok: true as const, url }
  })

  ipcMain.handle('browser:getUrl', () => {
    const wc = guestContents()
    if (!wc) return { url: '' as const }
    try {
      return { url: wc.getURL() }
    } catch {
      return { url: '' as const }
    }
  })

  ipcMain.handle('browser:captureNow', () => captureNow())

  ipcMain.handle('browser:updateNow', () => updateNow())

  ipcMain.handle('browser:savePdfNow', () => savePdfNow())

  ipcMain.handle('browser:setActionsSize', (e, payload: { width?: unknown; height?: unknown }) => {
    if (!actionsAlive() || !actions || e.sender !== actions.webContents) {
      return { ok: false as const }
    }
    const width = typeof payload?.width === 'number' ? payload.width : NaN
    const height = typeof payload?.height === 'number' ? payload.height : NaN
    if (!Number.isFinite(width) || !Number.isFinite(height)) return { ok: false as const }
    actionsSize = {
      width: Math.min(800, Math.max(1, Math.round(width))),
      height: Math.min(200, Math.max(1, Math.round(height)))
    }
    layoutBrowserChrome()
    return { ok: true as const }
  })
}
