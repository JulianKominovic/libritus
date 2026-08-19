import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { setActivePageJump } from '@renderer/lib/pdf-canvas/active-page-jump'
import type { CameraState } from '@renderer/lib/pdf-canvas/types'
import { useCallback, useEffect, type RefObject } from 'react'
import type { MarkUnsavedKind } from './usePdfPersistence'

type RuntimeSessionLike = {
  layout: {
    scrollForPageCenter: (i: number, c: CameraState) => { scrollY: number } | null
    scrollForWorldY: (y: number, c: CameraState) => { scrollY: number }
    pages: { length: number }
  }
} | null

type UsePdfNavigationArgs = {
  apiRef: RefObject<ExcalidrawImperativeAPI | null>
  sessionRef: RefObject<RuntimeSessionLike>
  containerRef: RefObject<HTMLDivElement | null>
  cameraRef: RefObject<CameraState>
  currentPageRef: RefObject<number>
  pushCamera: (partial: Partial<CameraState>) => void
  markUnsaved: (kind?: MarkUnsavedKind) => void
}

export function usePdfNavigation({
  apiRef,
  sessionRef,
  containerRef,
  cameraRef,
  currentPageRef,
  pushCamera,
  markUnsaved
}: UsePdfNavigationArgs) {
  const goToPage = useCallback(
    (pageIndex0: number) => {
      const layout = sessionRef.current?.layout
      const api = apiRef.current
      if (!layout || !api) return

      const clamped = Math.min(layout.pages.length - 1, Math.max(0, pageIndex0))
      const target = layout.scrollForPageCenter(clamped, cameraRef.current)
      if (!target) return

      pushCamera({ scrollY: target.scrollY })
      api.updateScene({
        appState: {
          scrollY: target.scrollY
        }
      })
      markUnsaved('camera')
    },
    [apiRef, cameraRef, markUnsaved, pushCamera, sessionRef]
  )

  const goToAnnotation = useCallback(
    (id: string) => {
      const api = apiRef.current
      const layout = sessionRef.current?.layout
      if (!api || !layout) return

      const el = api.getSceneElements().find((e) => e.id === id && !e.isDeleted)
      if (!el) return

      const cam = cameraRef.current
      const z = cam.zoom || 1
      const cx = el.x + el.width / 2
      const cy = el.y + el.height / 2
      const scrollX = -cx + cam.viewportWidth / (2 * z)
      const scrollY = layout.scrollForWorldY(cy, cam).scrollY

      pushCamera({ scrollX, scrollY })
      api.updateScene({
        appState: {
          scrollX,
          scrollY
        }
      })
      markUnsaved('camera')
    },
    [apiRef, cameraRef, markUnsaved, pushCamera, sessionRef]
  )

  const goToPage1Based = useCallback(
    (page1Based: number) => {
      goToPage(page1Based - 1)
    },
    [goToPage]
  )

  useEffect(() => {
    setActivePageJump(goToPage1Based)
    return () => setActivePageJump(null)
  }, [goToPage1Based])

  const goPrevPage = useCallback(() => {
    const pageIndex0 = currentPageRef.current - 1
    goToPage(pageIndex0 - 1)
  }, [goToPage, currentPageRef])

  const goNextPage = useCallback(() => {
    const pageIndex0 = currentPageRef.current - 1
    goToPage(pageIndex0 + 1)
  }, [goToPage, currentPageRef])

  const handleScrollChange = useCallback(
    (scrollX: number, scrollY: number, zoom: { value: number }) => {
      pushCamera({
        scrollX,
        scrollY,
        zoom: zoom.value
      })
      // Camera-only: reuses the cached content signature (no scene scan per wheel tick).
      markUnsaved('camera')
    },
    [markUnsaved, pushCamera]
  )

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      pushCamera({
        viewportWidth: width,
        viewportHeight: height
      })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [containerRef, pushCamera])

  return {
    goToPage,
    goToAnnotation,
    goToPage1Based,
    goPrevPage,
    goNextPage,
    handleScrollChange
  }
}
