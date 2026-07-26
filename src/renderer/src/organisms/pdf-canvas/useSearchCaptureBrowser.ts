import {
  CaptureUpdateAction,
  newElementWith,
  sceneCoordsToViewportCoords
} from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import {
  browserClose,
  browserDeactivate,
  browserOpen,
  browserSetBounds,
  browserZoomIn,
  browserZoomOut,
  OPEN_GRACE_MS,
  type BrowserBounds
} from '@renderer/integrations/webBrowser'
import { loadBinaryFiles } from '@renderer/lib/pdf-canvas/attachments'
import {
  applySearchCaptureScreenshot,
  findPdfSearchCaptureAt,
  getSearchCaptureQuery,
  getSearchCaptureUrl,
  isPdfSearchCapture,
  isPdfSearchCaptureCenterHit
} from '@renderer/lib/pdf-canvas/pdfSearchCapture'
import { clientToSceneCoords } from '@renderer/lib/pdf-canvas/selectionToHighlights'
import type { SaveStatus } from '@renderer/lib/pdf-canvas/session'
import { useCallback, useEffect, useRef, type RefObject } from 'react'

type UseSearchCaptureBrowserArgs = {
  apiRef: RefObject<ExcalidrawImperativeAPI | null>
  containerRef: RefObject<HTMLDivElement | null>
  excalidrawHostRef: RefObject<HTMLDivElement | null>
  persistedAttachmentIdsRef: RefObject<Set<string>>
  dirtyRef: RefObject<boolean>
  syncSaveChip: (next: SaveStatus) => void
  clearActiveEmbeddable: () => void
}

/**
 * Guest BrowserWindow lifecycle for search captures.
 * Owned by activeBrowserCaptureIdRef (not activeEmbeddable — guest steals focus mid-load).
 */
export function useSearchCaptureBrowser({
  apiRef,
  containerRef,
  excalidrawHostRef,
  persistedAttachmentIdsRef,
  dirtyRef,
  syncSaveChip,
  clearActiveEmbeddable
}: UseSearchCaptureBrowserArgs) {
  const activeBrowserCaptureIdRef = useRef<string | null>(null)
  const browserBoundsRef = useRef<BrowserBounds | null>(null)
  const browserOpenedAtRef = useRef(0)
  const browserChromeRef = useRef<HTMLDivElement>(null)
  const zoomPercentRef = useRef<HTMLSpanElement>(null)
  const captureActivateDownRef = useRef<{
    id: string
    clientX: number
    clientY: number
  } | null>(null)

  const setZoomPercentLabel = useCallback((factor: number) => {
    const el = zoomPercentRef.current
    if (el) el.textContent = `${Math.round(factor * 100)}%`
  }, [])

  const elementScreenBounds = useCallback(
    (el: { x: number; y: number; width: number; height: number }): BrowserBounds | null => {
      const api = apiRef.current
      if (!api) return null
      const appState = api.getAppState()
      const tl = sceneCoordsToViewportCoords({ sceneX: el.x, sceneY: el.y }, appState)
      const br = sceneCoordsToViewportCoords(
        { sceneX: el.x + el.width, sceneY: el.y + el.height },
        appState
      )
      return {
        x: Math.min(tl.x, br.x),
        y: Math.min(tl.y, br.y),
        width: Math.max(1, Math.abs(br.x - tl.x)),
        height: Math.max(1, Math.abs(br.y - tl.y))
      }
    },
    [apiRef]
  )

  const hideBrowserChromeHud = useCallback(() => {
    const chrome = browserChromeRef.current
    if (chrome) chrome.style.display = 'none'
  }, [])

  const syncBrowserChromeHud = useCallback(
    (bounds: BrowserBounds) => {
      const chrome = browserChromeRef.current
      const container = containerRef.current
      if (!chrome || !container) return
      const rect = container.getBoundingClientRect()
      chrome.style.left = `${bounds.x - rect.left}px`
      chrome.style.top = `${bounds.y - rect.top - 48}px`
      chrome.style.width = `${Math.max(bounds.width, 220)}px`
      chrome.style.display = 'flex'
    },
    [containerRef]
  )

  const deactivateSearchBrowser = useCallback(async () => {
    const captureId = activeBrowserCaptureIdRef.current
    if (!captureId) return

    const { fileId, url, deferred } = await browserDeactivate()
    // Main ignored deactivate during open grace — keep session alive.
    if (deferred) return

    activeBrowserCaptureIdRef.current = null
    browserBoundsRef.current = null
    hideBrowserChromeHud()
    clearActiveEmbeddable()

    if (!fileId) {
      console.warn('Search capture deactivate produced no fileId')
      return
    }

    const api = apiRef.current
    if (!api) return
    const scene = api.getSceneElements()
    const el = scene.find((e) => e.id === captureId)
    if (!el || el.isDeleted) {
      console.warn('Search capture element missing after deactivate', captureId)
      return
    }

    persistedAttachmentIdsRef.current.add(fileId)

    const files = await loadBinaryFiles([fileId])
    if (files.length > 0) api.addFiles(files)

    const updated = applySearchCaptureScreenshot(el, {
      fileId,
      url: url || getSearchCaptureUrl(el),
      capturedAt: new Date().toISOString()
    })

    api.updateScene({
      elements: scene.map((e) => (e.id === captureId ? updated : e)),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY
    })
    dirtyRef.current = true
    syncSaveChip('unsaved')
  }, [
    apiRef,
    clearActiveEmbeddable,
    dirtyRef,
    hideBrowserChromeHud,
    persistedAttachmentIdsRef,
    syncSaveChip
  ])

  const openSearchBrowser = useCallback(
    async (el: { id: string; x: number; y: number; width: number; height: number }) => {
      const bounds = elementScreenBounds(el)
      if (!bounds) return

      if (activeBrowserCaptureIdRef.current && activeBrowserCaptureIdRef.current !== el.id) {
        await deactivateSearchBrowser()
      }

      const sceneEl = apiRef.current?.getSceneElements().find((e) => e.id === el.id)
      const url =
        (sceneEl && getSearchCaptureUrl(sceneEl)) ||
        `https://www.google.com/search?q=${encodeURIComponent(
          (sceneEl && getSearchCaptureQuery(sceneEl)) || 'search'
        )}`

      activeBrowserCaptureIdRef.current = el.id
      browserBoundsRef.current = bounds
      browserOpenedAtRef.current = Date.now()
      syncBrowserChromeHud(bounds)
      try {
        const zoomFactor = await browserOpen(url, bounds)
        setZoomPercentLabel(zoomFactor)
      } catch (err) {
        console.error('Failed to open search browser', err)
        activeBrowserCaptureIdRef.current = null
        browserBoundsRef.current = null
        hideBrowserChromeHud()
        void browserClose()
      }
    },
    [
      apiRef,
      deactivateSearchBrowser,
      elementScreenBounds,
      hideBrowserChromeHud,
      setZoomPercentLabel,
      syncBrowserChromeHud
    ]
  )

  const syncActiveBrowserBounds = useCallback(() => {
    const id = activeBrowserCaptureIdRef.current
    if (!id) return
    const el = apiRef.current?.getSceneElements().find((e) => e.id === id)
    if (!el || el.isDeleted) return
    const bounds = elementScreenBounds(el)
    if (!bounds) return
    browserBoundsRef.current = bounds
    syncBrowserChromeHud(bounds)
    void browserSetBounds(bounds)
  }, [apiRef, elementScreenBounds, syncBrowserChromeHud])

  /** Tear down guest without capturePage (leave PDF / destroy session). */
  const disposeBrowser = useCallback(() => {
    if (!activeBrowserCaptureIdRef.current) return
    activeBrowserCaptureIdRef.current = null
    browserBoundsRef.current = null
    hideBrowserChromeHud()
    void browserClose()
  }, [hideBrowserChromeHud])

  const isBrowsing = useCallback(() => activeBrowserCaptureIdRef.current != null, [])

  const zoomIn = useCallback(async () => {
    if (!activeBrowserCaptureIdRef.current) return
    setZoomPercentLabel(await browserZoomIn())
  }, [setZoomPercentLabel])

  const zoomOut = useCallback(async () => {
    if (!activeBrowserCaptureIdRef.current) return
    setZoomPercentLabel(await browserZoomOut())
  }, [setZoomPercentLabel])

  /** Resize active capture about its center; guest bounds follow via sync. */
  const resizeActiveBrowser = useCallback(
    (width: number, height: number) => {
      const id = activeBrowserCaptureIdRef.current
      const api = apiRef.current
      if (!id || !api) return
      const scene = api.getSceneElements()
      const el = scene.find((e) => e.id === id)
      if (!el || el.isDeleted || !isPdfSearchCapture(el)) return
      if (el.width === width && el.height === height) return

      const updated = newElementWith(el, {
        width,
        height,
        x: el.x + (el.width - width) / 2,
        y: el.y + (el.height - height) / 2
      }) as typeof el

      api.updateScene({
        elements: scene.map((e) => (e.id === id ? updated : e)),
        captureUpdate: CaptureUpdateAction.IMMEDIATELY
      })
      dirtyRef.current = true
      syncSaveChip('unsaved')
      // onChange also syncs; call now so guest moves before next frame.
      const bounds = elementScreenBounds(updated)
      if (bounds) {
        browserBoundsRef.current = bounds
        syncBrowserChromeHud(bounds)
        void browserSetBounds(bounds)
      }
    },
    [apiRef, dirtyRef, elementScreenBounds, syncBrowserChromeHud, syncSaveChip]
  )

  // Escape from guest BrowserWindow (focus is in the native window).
  useEffect(() => {
    const onEscape = () => {
      if (!activeBrowserCaptureIdRef.current) return
      void deactivateSearchBrowser()
    }
    return window.electron.ipcRenderer.on('browser:escape', onEscape)
  }, [deactivateSearchBrowser])

  // Keyboard zoom in guest pushes factor to host chrome (imperative — no setState).
  useEffect(() => {
    return window.electron.ipcRenderer.on(
      'browser:zoom',
      (_event: unknown, payload: { zoomFactor?: unknown }) => {
        if (!activeBrowserCaptureIdRef.current) return
        const z = payload?.zoomFactor
        if (typeof z === 'number' && Number.isFinite(z)) setZoomPercentLabel(z)
      }
    )
  }, [setZoomPercentLabel])

  // Center-click opens the guest; click outside closes it.
  // Host-owned so native `image` captures (post-screenshot) activate too.
  useEffect(() => {
    const host = excalidrawHostRef.current
    if (!host) return

    const onPointerDownCapture = (event: PointerEvent) => {
      captureActivateDownRef.current = null
      if (event.button !== 0) return
      const target = event.target
      if (target instanceof Element && target.closest('[data-browser-chrome]')) return

      const api = apiRef.current
      if (!api) return
      const { x, y } = clientToSceneCoords(event.clientX, event.clientY, api.getAppState())

      const browsingId = activeBrowserCaptureIdRef.current
      if (browsingId) {
        if (Date.now() - browserOpenedAtRef.current < OPEN_GRACE_MS) return
        const el = api.getSceneElements().find((e) => e.id === browsingId)
        if (!el || el.isDeleted) {
          void deactivateSearchBrowser()
          return
        }
        const inside = x >= el.x && x <= el.x + el.width && y >= el.y && y <= el.y + el.height
        if (!inside) void deactivateSearchBrowser()
        return
      }

      const capture = findPdfSearchCaptureAt(api.getSceneElements(), x, y)
      if (capture && !capture.locked && isPdfSearchCaptureCenterHit(capture, x, y)) {
        captureActivateDownRef.current = {
          id: capture.id,
          clientX: event.clientX,
          clientY: event.clientY
        }
      }
    }

    const onPointerUpCapture = (event: PointerEvent) => {
      const down = captureActivateDownRef.current
      captureActivateDownRef.current = null
      if (!down || event.button !== 0) return
      if (activeBrowserCaptureIdRef.current) return
      const dx = event.clientX - down.clientX
      const dy = event.clientY - down.clientY
      if (dx * dx + dy * dy > 25) return // drag, not click

      const api = apiRef.current
      if (!api) return
      const el = api.getSceneElements().find((e) => e.id === down.id)
      if (!el || el.isDeleted || !isPdfSearchCapture(el)) return
      void openSearchBrowser(el)
    }

    host.addEventListener('pointerdown', onPointerDownCapture, true)
    host.addEventListener('pointerup', onPointerUpCapture, true)
    return () => {
      host.removeEventListener('pointerdown', onPointerDownCapture, true)
      host.removeEventListener('pointerup', onPointerUpCapture, true)
    }
  }, [apiRef, deactivateSearchBrowser, excalidrawHostRef, openSearchBrowser])

  return {
    browserChromeRef,
    zoomPercentRef,
    zoomIn,
    zoomOut,
    resizeActiveBrowser,
    isBrowsing,
    syncActiveBrowserBounds,
    deactivateSearchBrowser,
    disposeBrowser
  }
}
