import {
  CaptureUpdateAction,
  newElementWith,
  sceneCoordsToViewportCoords
} from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import {
  browserClose,
  browserDeactivate,
  browserOpen,
  browserSetBounds,
  browserSetZoom,
  OPEN_GRACE_MS,
  type BrowserBounds
} from '@renderer/integrations/webBrowser'
import { loadBinaryFiles } from '@renderer/lib/pdf-canvas/attachments'
import {
  applySearchCaptureScreenshot,
  demoteSearchCaptureToEmbeddable,
  findPdfSearchCaptureAt,
  getSearchCaptureFileId,
  getSearchCaptureUrl,
  guestEffectiveZoom,
  isActiveSearchCapturePointerHit,
  isPdfSearchCapture,
  isPdfSearchCaptureCenterHit,
  resolveSearchCaptureOpenUrl,
  SEARCH_CAPTURE_DEFAULT_USER_ZOOM,
  stepGuestUserZoom
} from '@renderer/lib/pdf-canvas/pdfSearchCapture'
import { clientToSceneCoords } from '@renderer/lib/pdf-canvas/selectionToHighlights'
import { isExcalidrawUiPointerTarget } from '@renderer/lib/pdf-canvas/excalidrawUiTarget'
import type { SaveStatus } from '@renderer/lib/pdf-canvas/session'
import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { liveExcalidrawApi } from './selectionTool'

type UseSearchCaptureBrowserArgs = {
  apiRef: RefObject<ExcalidrawImperativeAPI | null>
  containerRef: RefObject<HTMLDivElement | null>
  excalidrawHostRef: RefObject<HTMLDivElement | null>
  persistedAttachmentIdsRef: RefObject<Set<string>>
  dirtyRef: RefObject<boolean>
  syncSaveChip: (next: SaveStatus) => void
  clearActiveEmbeddable: () => void
}

/** Keep Excalidraw transform handles outside the native WCV hit area. */
const GUEST_BOUNDS_INSET_PX = 12

/**
 * Guest WebContentsView lifecycle for search captures.
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
  /** Chrome % — independent of Excalidraw camera; effective = user × canvasZoom. */
  const userZoomFactorRef = useRef(SEARCH_CAPTURE_DEFAULT_USER_ZOOM)
  /** Last *requested* effective (skip redundant IPC); clamp may make Chromium differ. */
  const lastRequestedEffectiveZoomRef = useRef<number | null>(null)
  const captureActivateDownRef = useRef<{
    id: string
    clientX: number
    clientY: number
  } | null>(null)

  const setZoomPercentLabel = useCallback((factor: number) => {
    const el = zoomPercentRef.current
    if (el) el.textContent = `${Math.round(factor * 100)}%`
  }, [])

  const canvasZoom = useCallback((): number => {
    const z = liveExcalidrawApi(apiRef.current)?.getAppState().zoom?.value
    return typeof z === 'number' && z > 0 && Number.isFinite(z) ? z : 1
  }, [apiRef])

  /** Apply Chromium zoom = userZoom × canvasZoom (skip IPC if request unchanged). */
  const applyEffectiveGuestZoom = useCallback(
    (userZoom: number) => {
      const effective = guestEffectiveZoom(userZoom, canvasZoom())
      if (lastRequestedEffectiveZoomRef.current === effective) return
      lastRequestedEffectiveZoomRef.current = effective
      // Fire-and-forget; do not rewrite userZoom from clamped return.
      void browserSetZoom(effective)
    },
    [canvasZoom]
  )

  /** Chrome / Cmd±: step user zoom in user space, then compensate. */
  const stepUserZoom = useCallback(
    (deltaLevel: number) => {
      if (!activeBrowserCaptureIdRef.current) return
      const next = stepGuestUserZoom(userZoomFactorRef.current, deltaLevel)
      userZoomFactorRef.current = next
      setZoomPercentLabel(next)
      // Force re-apply even if product coincidentally matches (e.g. after clamp).
      lastRequestedEffectiveZoomRef.current = null
      applyEffectiveGuestZoom(next)
    },
    [applyEffectiveGuestZoom, setZoomPercentLabel]
  )

  const elementScreenBounds = useCallback(
    (el: { x: number; y: number; width: number; height: number }): BrowserBounds | null => {
      const api = liveExcalidrawApi(apiRef.current)
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

  /** Inset guest so edge/corner handles stay on the host (WCV can't steal the drag). */
  const guestScreenBounds = useCallback(
    (el: { x: number; y: number; width: number; height: number }): BrowserBounds | null => {
      const full = elementScreenBounds(el)
      if (!full) return null
      const inset = GUEST_BOUNDS_INSET_PX
      return {
        x: full.x + inset,
        y: full.y + inset,
        width: Math.max(1, full.width - inset * 2),
        height: Math.max(1, full.height - inset * 2)
      }
    },
    [elementScreenBounds]
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

  const syncGuestToElement = useCallback(
    (el: { x: number; y: number; width: number; height: number }) => {
      const full = elementScreenBounds(el)
      const guest = guestScreenBounds(el)
      if (!full || !guest) return
      browserBoundsRef.current = guest
      syncBrowserChromeHud(full)
      void browserSetBounds(guest)
      applyEffectiveGuestZoom(userZoomFactorRef.current)
    },
    [applyEffectiveGuestZoom, elementScreenBounds, guestScreenBounds, syncBrowserChromeHud]
  )

  const deactivateSearchBrowser = useCallback(async () => {
    const captureId = activeBrowserCaptureIdRef.current
    if (!captureId) return

    const { fileId, url, deferred } = await browserDeactivate()
    // Main ignored deactivate during open grace — keep session alive.
    if (deferred) return

    activeBrowserCaptureIdRef.current = null
    browserBoundsRef.current = null
    lastRequestedEffectiveZoomRef.current = null
    hideBrowserChromeHud()
    clearActiveEmbeddable()

    if (!fileId) {
      console.warn('Search capture deactivate produced no fileId')
      return
    }

    const api = liveExcalidrawApi(apiRef.current)
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
    async (el: {
      id: string
      x: number
      y: number
      width: number
      height: number
      customData?: ExcalidrawElement['customData']
    }) => {
      const guest = guestScreenBounds(el)
      const full = elementScreenBounds(el)
      if (!guest || !full) return

      if (activeBrowserCaptureIdRef.current && activeBrowserCaptureIdRef.current !== el.id) {
        await deactivateSearchBrowser()
      }

      const api = liveExcalidrawApi(apiRef.current)
      const sceneEl = api?.getSceneElements().find((e) => e.id === el.id)
      const url = resolveSearchCaptureOpenUrl(el, sceneEl)

      // Image captures lock aspect ratio in Excalidraw — demote while browsing.
      // Keep activeEmbeddable null so the inset ring stays on the canvas (move/resize).
      let demotedFromImage = false
      const browseAppState = {
        selectedElementIds: { [el.id]: true },
        activeEmbeddable: null
      }
      if (sceneEl && isPdfSearchCapture(sceneEl) && sceneEl.type === 'image' && api) {
        demotedFromImage = true
        const demoted = demoteSearchCaptureToEmbeddable(sceneEl)
        api.updateScene({
          elements: api.getSceneElements().map((e) => (e.id === el.id ? demoted : e)),
          appState: browseAppState,
          captureUpdate: CaptureUpdateAction.NEVER
        })
      } else if (api) {
        api.updateScene({
          appState: browseAppState,
          captureUpdate: CaptureUpdateAction.NEVER
        })
      }

      activeBrowserCaptureIdRef.current = el.id
      browserBoundsRef.current = guest
      browserOpenedAtRef.current = Date.now()
      userZoomFactorRef.current = SEARCH_CAPTURE_DEFAULT_USER_ZOOM
      const effective = guestEffectiveZoom(SEARCH_CAPTURE_DEFAULT_USER_ZOOM, canvasZoom())
      lastRequestedEffectiveZoomRef.current = effective
      syncBrowserChromeHud(full)
      setZoomPercentLabel(SEARCH_CAPTURE_DEFAULT_USER_ZOOM)
      clearActiveEmbeddable()
      try {
        await browserOpen(url, guest, effective)
        // Left / swapped capture while open was in flight — do not touch a dead session.
        if (activeBrowserCaptureIdRef.current !== el.id) return
        // Chromium may reset zoom after setVisible/navigate; dedupe would skip a same-value
        // re-apply — clear and force so guest matches user×canvas (fixes "too large until resize").
        lastRequestedEffectiveZoomRef.current = null
        applyEffectiveGuestZoom(userZoomFactorRef.current)
        const live = liveExcalidrawApi(apiRef.current)
          ?.getSceneElements()
          .find((e) => e.id === el.id)
        if (live) syncGuestToElement(live)
        // Navigate can reset zoom after IPC returns — one delayed re-apply if still browsing.
        window.setTimeout(() => {
          if (activeBrowserCaptureIdRef.current !== el.id) return
          lastRequestedEffectiveZoomRef.current = null
          applyEffectiveGuestZoom(userZoomFactorRef.current)
        }, 200)
      } catch (err) {
        console.error('Failed to open search browser', err)
        activeBrowserCaptureIdRef.current = null
        browserBoundsRef.current = null
        lastRequestedEffectiveZoomRef.current = null
        hideBrowserChromeHud()
        void browserClose()
        // Roll back demote so the user keeps the screenshot image.
        if (demotedFromImage && api) {
          const cur = api.getSceneElements().find((e) => e.id === el.id)
          const fileId = cur ? getSearchCaptureFileId(cur) : null
          if (cur && fileId) {
            const restored = applySearchCaptureScreenshot(cur, {
              fileId,
              url: getSearchCaptureUrl(cur),
              capturedAt:
                typeof cur.customData?.capturedAt === 'string'
                  ? cur.customData.capturedAt
                  : new Date().toISOString()
            })
            api.updateScene({
              elements: api.getSceneElements().map((e) => (e.id === el.id ? restored : e)),
              captureUpdate: CaptureUpdateAction.NEVER
            })
          }
        }
      }
    },
    [
      apiRef,
      applyEffectiveGuestZoom,
      canvasZoom,
      clearActiveEmbeddable,
      deactivateSearchBrowser,
      elementScreenBounds,
      guestScreenBounds,
      hideBrowserChromeHud,
      setZoomPercentLabel,
      syncBrowserChromeHud,
      syncGuestToElement
    ]
  )

  /** Tear down guest without capturePage (leave PDF / destroy session / element deleted). */
  const disposeBrowser = useCallback(() => {
    if (!activeBrowserCaptureIdRef.current) return
    activeBrowserCaptureIdRef.current = null
    browserBoundsRef.current = null
    lastRequestedEffectiveZoomRef.current = null
    hideBrowserChromeHud()
    void browserClose()
  }, [hideBrowserChromeHud])

  const syncActiveBrowserBounds = useCallback(() => {
    const id = activeBrowserCaptureIdRef.current
    if (!id) return
    const api = liveExcalidrawApi(apiRef.current)
    if (!api) return
    const el = api.getSceneElements().find((e) => e.id === id)
    if (!el || el.isDeleted) {
      disposeBrowser()
      return
    }
    // Live-follow resize/move — inset keeps handles outside the WCV.
    syncGuestToElement(el)
  }, [apiRef, disposeBrowser, syncGuestToElement])

  const isBrowsing = useCallback(() => activeBrowserCaptureIdRef.current != null, [])

  /**
   * Browse must stay in Excalidraw "selected" mode (thin border, PE-none on embed)
   * so the 12px WCV inset ring stays canvas-draggable. Center-click schedules
   * activeEmbeddable after ~100ms — clear now and whenever onChange re-activates it.
   */
  const suppressActiveEmbedWhileBrowsing = useCallback(() => {
    const browsingId = activeBrowserCaptureIdRef.current
    if (!browsingId) return
    const api = liveExcalidrawApi(apiRef.current)
    const active = api?.getAppState().activeEmbeddable
    if (active?.state !== 'active') return
    if (active.element?.id !== browsingId) return
    clearActiveEmbeddable()
  }, [apiRef, clearActiveEmbeddable])

  const zoomIn = useCallback(() => {
    stepUserZoom(1)
  }, [stepUserZoom])

  const zoomOut = useCallback(() => {
    stepUserZoom(-1)
  }, [stepUserZoom])

  /** Resize active capture about its center; guest bounds follow via sync. */
  const resizeActiveBrowser = useCallback(
    (width: number, height: number) => {
      const id = activeBrowserCaptureIdRef.current
      const api = liveExcalidrawApi(apiRef.current)
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
      syncGuestToElement(updated)
    },
    [apiRef, dirtyRef, syncGuestToElement, syncSaveChip]
  )

  // Escape from guest WebContentsView (focus is in the guest webContents).
  useEffect(() => {
    const onEscape = () => {
      if (!activeBrowserCaptureIdRef.current) return
      void deactivateSearchBrowser()
    }
    return window.electron.ipcRenderer.on('browser:escape', onEscape)
  }, [deactivateSearchBrowser])

  // Cmd/Ctrl± in guest → step user zoom (same path as BrowserChrome).
  useEffect(() => {
    return window.electron.ipcRenderer.on(
      'browser:zoom-step',
      (_event: unknown, payload: { delta?: unknown }) => {
        const d = payload?.delta
        if (typeof d === 'number' && Number.isFinite(d) && d !== 0) stepUserZoom(Math.sign(d))
      }
    )
  }, [stepUserZoom])

  // Center-click opens the guest; click outside closes it.
  // Host-owned so native `image` captures (post-screenshot) activate too.
  // Ignore Excalidraw chrome: scene hit-test would otherwise activate embeds
  // sitting under the left style panel / toolbars.
  useEffect(() => {
    const host = excalidrawHostRef.current
    if (!host) return

    const onPointerDownCapture = (event: PointerEvent) => {
      captureActivateDownRef.current = null
      if (event.button !== 0) return
      if (isExcalidrawUiPointerTarget(event.target)) return

      const api = liveExcalidrawApi(apiRef.current)
      if (!api) return
      const { x, y } = clientToSceneCoords(event.clientX, event.clientY, api.getAppState())

      const browsingId = activeBrowserCaptureIdRef.current
      if (browsingId) {
        if (Date.now() - browserOpenedAtRef.current < OPEN_GRACE_MS) return
        const el = api.getSceneElements().find((e) => e.id === browsingId)
        if (!el || el.isDeleted) {
          disposeBrowser()
          return
        }
        const zoom = api.getAppState().zoom?.value ?? 1
        // Pad keeps transform handles from counting as outside-click.
        if (!isActiveSearchCapturePointerHit(el, x, y, zoom)) {
          void deactivateSearchBrowser()
        }
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
      if (isExcalidrawUiPointerTarget(event.target)) return
      if (activeBrowserCaptureIdRef.current) return
      const dx = event.clientX - down.clientX
      const dy = event.clientY - down.clientY
      if (dx * dx + dy * dy > 25) return // drag, not click

      const api = liveExcalidrawApi(apiRef.current)
      if (!api) return
      const el = api.getSceneElements().find((e) => e.id === down.id)
      if (!el || el.isDeleted || !isPdfSearchCapture(el)) return
      void openSearchBrowser(el)
    }

    host.addEventListener('pointerdown', onPointerDownCapture, true)
    // pointerup on window: Excalidraw may release outside the host.
    window.addEventListener('pointerup', onPointerUpCapture, true)
    return () => {
      host.removeEventListener('pointerdown', onPointerDownCapture, true)
      window.removeEventListener('pointerup', onPointerUpCapture, true)
    }
  }, [apiRef, deactivateSearchBrowser, disposeBrowser, excalidrawHostRef, openSearchBrowser])

  return {
    browserChromeRef,
    zoomPercentRef,
    zoomIn,
    zoomOut,
    resizeActiveBrowser,
    isBrowsing,
    syncActiveBrowserBounds,
    suppressActiveEmbedWhileBrowsing,
    openSearchBrowser,
    deactivateSearchBrowser,
    disposeBrowser
  }
}
