import { CaptureUpdateAction } from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { readFile, writeFile } from '@renderer/integrations/fs'
import {
  browserHide,
  browserSetCaptureTarget,
  browserShow,
  type BrowserCapturedPayload,
  type BrowserPdfSavedPayload
} from '@renderer/integrations/webBrowser'
import { loadBinaryFiles } from '@renderer/lib/pdf-canvas/attachments'
import { isExcalidrawUiPointerTarget } from '@renderer/lib/pdf-canvas/excalidrawUiTarget'
import {
  createPdfClip,
  fitCardSize,
  PDF_CLIP_MAX_HEIGHT,
  PDF_CLIP_MAX_WIDTH,
  rasterPdfFirstPagePng
} from '@renderer/lib/pdf-canvas/pdfClip'
import {
  applySearchCaptureScreenshot,
  createSearchCapture,
  findPdfSearchCaptureAt,
  getSearchCaptureFileId,
  getSearchCaptureUrl,
  isPdfSearchCapture,
  isPdfSearchCaptureCenterHit,
  resolveSearchCaptureOpenUrl,
  SEARCH_CAPTURE_HEIGHT,
  SEARCH_CAPTURE_WIDTH
} from '@renderer/lib/pdf-canvas/pdfSearchCapture'
import { clientToSceneCoords } from '@renderer/lib/pdf-canvas/selectionToHighlights'
import type { SaveStatus } from '@renderer/lib/pdf-canvas/session'
import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { liveExcalidrawApi } from './selectionTool'

type UseSearchCaptureBrowserArgs = {
  apiRef: RefObject<ExcalidrawImperativeAPI | null>
  excalidrawHostRef: RefObject<HTMLDivElement | null>
  persistedAttachmentIdsRef: RefObject<Set<string>>
  dirtyRef: RefObject<boolean>
  syncSaveChip: (next: SaveStatus) => void
}

const CAPTURE_CARD_MAX_W = 480
const CAPTURE_CARD_MAX_H = 720
const THUMB_SIZE = 56

function viewportCenterOrigin(
  api: ExcalidrawImperativeAPI,
  width: number,
  height: number
): { x: number; y: number } {
  const appState = api.getAppState()
  const z = appState.zoom?.value || 1
  const sceneX = -appState.scrollX + appState.width / (2 * z)
  const sceneY = -appState.scrollY + appState.height / (2 * z)
  return { x: sceneX - width / 2, y: sceneY - height / 2 }
}

/** Downscale Excalidraw file dataURL for the browser chrome chip (~56px JPEG). */
function thumbnailFromDataUrl(dataURL: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const w = img.naturalWidth || 1
        const h = img.naturalHeight || 1
        const scale = THUMB_SIZE / Math.max(w, h)
        const cw = Math.max(1, Math.round(w * scale))
        const ch = Math.max(1, Math.round(h * scale))
        const canvas = document.createElement('canvas')
        canvas.width = cw
        canvas.height = ch
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(null)
          return
        }
        ctx.drawImage(img, 0, 0, cw, ch)
        resolve(canvas.toDataURL('image/jpeg', 0.7))
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = dataURL
  })
}

/**
 * Dedicated browser window for search captures.
 * Click a card → show/focus + that URL.
 * Capturar always adds a new card; Actualizar replaces the selected one.
 */
export function useSearchCaptureBrowser({
  apiRef,
  excalidrawHostRef,
  persistedAttachmentIdsRef,
  dirtyRef,
  syncSaveChip
}: UseSearchCaptureBrowserArgs) {
  const captureActivateDownRef = useRef<{
    id: string
    clientX: number
    clientY: number
  } | null>(null)
  /** Identity gate: `id:fileId` or null — skip IPC when unchanged. */
  const lastTargetKeyRef = useRef<string | null>(null)
  const thumbGenRef = useRef(0)
  /** True while openSearchBrowser pins the card (guest focus often clears selection). */
  const pinningTargetRef = useRef(false)

  const clearBrowserTarget = useCallback(() => {
    if (lastTargetKeyRef.current === null) return
    lastTargetKeyRef.current = null
    thumbGenRef.current += 1
    void browserSetCaptureTarget(null)
  }, [])

  const syncBrowserTarget = useCallback((api: ExcalidrawImperativeAPI | null) => {
    const live = liveExcalidrawApi(api)
    if (!live) {
      clearBrowserTarget()
      return
    }

    const selected = live.getAppState().selectedElementIds ?? {}
    const selectedIds = Object.keys(selected).filter((id) => selected[id])

    // Empty selection while the canvas is focused = user deselected → hide Replace.
    // Guest focus often clears Excalidraw selection; keep the target in that case.
    if (selectedIds.length === 0) {
      if (pinningTargetRef.current || !document.hasFocus()) return
      clearBrowserTarget()
      return
    }

    let capture: ExcalidrawElement | undefined
    if (selectedIds.length === 1) {
      const el = live.getSceneElements().find((e) => e.id === selectedIds[0])
      if (el && !el.isDeleted && isPdfSearchCapture(el)) capture = el
    }

    if (!capture) {
      clearBrowserTarget()
      return
    }

    const fileId = getSearchCaptureFileId(capture)
    const key = `${capture.id}:${fileId ?? ''}`
    if (key === lastTargetKeyRef.current) return
    lastTargetKeyRef.current = key
    const gen = ++thumbGenRef.current

    const captureId = capture.id
    const title = getSearchCaptureUrl(capture) || undefined
    // Set id immediately so Update works before thumb finishes (async race).
    void browserSetCaptureTarget({ captureId, thumbnailDataUrl: null, title })

    const files = live.getFiles()
    const dataURL = fileId ? files[fileId]?.dataURL : undefined
    if (typeof dataURL !== 'string') return

    void (async () => {
      const thumbnailDataUrl = await thumbnailFromDataUrl(dataURL)
      if (thumbGenRef.current !== gen || !thumbnailDataUrl) return
      await browserSetCaptureTarget({ captureId, thumbnailDataUrl, title })
    })()
  }, [clearBrowserTarget])

  const openSearchBrowser = useCallback(
    async (el: { id: string; customData?: ExcalidrawElement['customData'] }) => {
      const api = liveExcalidrawApi(apiRef.current)
      const sceneEl = api?.getSceneElements().find((e) => e.id === el.id)
      const url = resolveSearchCaptureOpenUrl(el, sceneEl)
      const fileId = sceneEl ? getSearchCaptureFileId(sceneEl) : null
      const title = sceneEl
        ? getSearchCaptureUrl(sceneEl) || undefined
        : typeof el.customData?.url === 'string'
          ? el.customData.url
          : undefined

      // Pin Update target before show so updateNow cannot race an empty sourceCaptureId.
      pinningTargetRef.current = true
      lastTargetKeyRef.current = `${el.id}:${fileId ?? ''}`
      const gen = ++thumbGenRef.current
      try {
        await browserSetCaptureTarget({
          captureId: el.id,
          thumbnailDataUrl: null,
          title
        })

        if (api) {
          api.updateScene({
            appState: { selectedElementIds: { [el.id]: true } },
            captureUpdate: CaptureUpdateAction.NEVER
          })
          const dataURL = fileId ? api.getFiles()[fileId]?.dataURL : undefined
          if (typeof dataURL === 'string') {
            void (async () => {
              const thumbnailDataUrl = await thumbnailFromDataUrl(dataURL)
              if (thumbGenRef.current !== gen || !thumbnailDataUrl) return
              await browserSetCaptureTarget({
                captureId: el.id,
                thumbnailDataUrl,
                title
              })
            })()
          }
        }
        await browserShow({ url })
      } finally {
        pinningTargetRef.current = false
      }
    },
    [apiRef]
  )

  const disposeBrowser = useCallback(() => {
    pinningTargetRef.current = false
    lastTargetKeyRef.current = null
    thumbGenRef.current += 1
    void browserSetCaptureTarget(null)
    void browserHide()
  }, [])

  const applyCapturedPng = useCallback(
    async (payload: BrowserCapturedPayload) => {
      if (!payload.fileId) {
        console.warn('Search capture produced no fileId')
        return
      }
      const api = liveExcalidrawApi(apiRef.current)
      if (!api) return

      persistedAttachmentIdsRef.current.add(payload.fileId)
      const files = await loadBinaryFiles([payload.fileId])
      if (files.length > 0) api.addFiles(files)

      const size = fitCardSize(
        payload.width || SEARCH_CAPTURE_WIDTH,
        payload.height || SEARCH_CAPTURE_HEIGHT,
        CAPTURE_CARD_MAX_W,
        CAPTURE_CARD_MAX_H
      )
      const capturedAt = new Date().toISOString()
      const url = payload.url
      const scene = api.getSceneElements()
      const existing = payload.captureId
        ? scene.find((e) => e.id === payload.captureId && isPdfSearchCapture(e) && !e.isDeleted)
        : undefined

      if (existing) {
        const updated = applySearchCaptureScreenshot(existing, {
          fileId: payload.fileId,
          url: url || getSearchCaptureUrl(existing),
          capturedAt,
          width: size.width,
          height: size.height
        })
        api.updateScene({
          elements: scene.map((e) => (e.id === existing.id ? updated : e)),
          captureUpdate: CaptureUpdateAction.IMMEDIATELY
        })
      } else {
        const origin = viewportCenterOrigin(api, size.width, size.height)
        const capture = createSearchCapture({
          x: origin.x,
          y: origin.y,
          width: size.width,
          height: size.height,
          query: '',
          url
        })
        const promoted = applySearchCaptureScreenshot(capture, {
          fileId: payload.fileId,
          url,
          capturedAt,
          width: size.width,
          height: size.height
        })
        api.updateScene({
          elements: [...scene, promoted],
          appState: { selectedElementIds: { [promoted.id]: true } },
          captureUpdate: CaptureUpdateAction.IMMEDIATELY
        })
      }
      dirtyRef.current = true
      syncSaveChip('unsaved')
      // fileId changed → refresh Update target thumb
      syncBrowserTarget(liveExcalidrawApi(apiRef.current))
    },
    [apiRef, dirtyRef, persistedAttachmentIdsRef, syncBrowserTarget, syncSaveChip]
  )

  const applySavedPdf = useCallback(
    async (payload: BrowserPdfSavedPayload) => {
      try {
        const api = liveExcalidrawApi(apiRef.current)
        if (!api) return

        let previewId = payload.previewFileId ?? null
        let srcW = payload.previewWidth || 0
        let srcH = payload.previewHeight || 0

        if (!previewId) {
          const pdfBytes = await readFile(`attachments/${payload.pdfFileId}.pdf`)
          if (!liveExcalidrawApi(apiRef.current)) return
          if (!pdfBytes) {
            console.warn('PDF clip missing attachment', payload.pdfFileId)
            return
          }
          const raster = await rasterPdfFirstPagePng(pdfBytes)
          if (!liveExcalidrawApi(apiRef.current)) return
          if (!raster) {
            console.warn('PDF clip raster failed', payload.pdfFileId)
            return
          }
          previewId = crypto.randomUUID()
          await writeFile(`attachments/${previewId}.png`, raster.png)
          if (!liveExcalidrawApi(apiRef.current)) return
          srcW = raster.width
          srcH = raster.height
        }

        const live = liveExcalidrawApi(apiRef.current)
        if (!live) return

        persistedAttachmentIdsRef.current.add(previewId)
        const files = await loadBinaryFiles([previewId])
        if (!liveExcalidrawApi(apiRef.current)) return
        if (files.length > 0) live.addFiles(files)

        const size = fitCardSize(
          srcW || PDF_CLIP_MAX_WIDTH,
          srcH || PDF_CLIP_MAX_HEIGHT,
          PDF_CLIP_MAX_WIDTH,
          PDF_CLIP_MAX_HEIGHT
        )
        const origin = viewportCenterOrigin(live, size.width, size.height)
        const clip = createPdfClip({
          x: origin.x,
          y: origin.y,
          width: size.width,
          height: size.height,
          pdfFileId: payload.pdfFileId,
          previewFileId: previewId,
          url: payload.url,
          title: payload.title
        })
        live.updateScene({
          elements: [...live.getSceneElements(), clip],
          appState: { selectedElementIds: { [clip.id]: true } },
          captureUpdate: CaptureUpdateAction.IMMEDIATELY
        })
        dirtyRef.current = true
        syncSaveChip('unsaved')
      } catch (err) {
        console.warn('PDF clip apply failed', err)
      }
    },
    [apiRef, dirtyRef, persistedAttachmentIdsRef, syncSaveChip]
  )

  useEffect(() => {
    const offCaptured = window.electron.ipcRenderer.on(
      'browser:captured',
      (_e: unknown, payload: BrowserCapturedPayload) => {
        void applyCapturedPng(payload)
      }
    )
    const offPdf = window.electron.ipcRenderer.on(
      'browser:pdf-saved',
      (_e: unknown, payload: BrowserPdfSavedPayload) => {
        void applySavedPdf(payload)
      }
    )
    return () => {
      offCaptured()
      offPdf()
    }
  }, [applyCapturedPng, applySavedPdf])

  useEffect(() => {
    const onHostFocus = () => {
      const api = liveExcalidrawApi(apiRef.current)
      if (api) syncBrowserTarget(api)
    }
    window.addEventListener('focus', onHostFocus)
    return () => window.removeEventListener('focus', onHostFocus)
  }, [apiRef, syncBrowserTarget])

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
      const dx = event.clientX - down.clientX
      const dy = event.clientY - down.clientY
      if (dx * dx + dy * dy > 25) return

      const api = liveExcalidrawApi(apiRef.current)
      if (!api) return
      const el = api.getSceneElements().find((e) => e.id === down.id)
      if (!el || el.isDeleted || !isPdfSearchCapture(el)) return
      void openSearchBrowser(el)
    }

    host.addEventListener('pointerdown', onPointerDownCapture, true)
    window.addEventListener('pointerup', onPointerUpCapture, true)
    return () => {
      host.removeEventListener('pointerdown', onPointerDownCapture, true)
      window.removeEventListener('pointerup', onPointerUpCapture, true)
    }
  }, [apiRef, excalidrawHostRef, openSearchBrowser])

  return {
    openSearchBrowser,
    disposeBrowser,
    syncBrowserTarget
  }
}
