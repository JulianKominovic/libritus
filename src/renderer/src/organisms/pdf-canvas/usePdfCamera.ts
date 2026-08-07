import type { CameraState } from '@renderer/lib/pdf-canvas/types'
import { useCallback, useRef, type RefObject } from 'react'
import type { PageNavigatorHandle } from './PageNavigator'
import type { PdfLayerHandle } from './PdfLayer'
import type { PdfSidebarHandle } from './PdfSidebar'

export const INITIAL_CAMERA: CameraState = {
  scrollX: 100,
  scrollY: 60,
  zoom: 2,
  viewportWidth: typeof window !== 'undefined' ? window.innerWidth : 1280,
  viewportHeight: typeof window !== 'undefined' ? window.innerHeight : 800
}

type RuntimeSessionLike = { layout: { pageIndexForCamera(cam: CameraState): number | null } } | null

type UsePdfCameraArgs = {
  sessionRef: RefObject<RuntimeSessionLike>
  containerRef: RefObject<HTMLDivElement | null>
  pdfLayerRef: RefObject<PdfLayerHandle | null>
  pageNavigatorRef: RefObject<PageNavigatorHandle | null>
  pdfSidebarRef: RefObject<PdfSidebarHandle | null>
}

/**
 * Camera + current page are Excalidraw-owned; the host mirrors them into refs and
 * pushes the layer/UI. `pushCameraRaw` skips overlay positioning — the component
 * composes a `pushCamera` that also repositions the highlight toolbar / browse hint.
 */
export function usePdfCamera({
  sessionRef,
  containerRef,
  pdfLayerRef,
  pageNavigatorRef,
  pdfSidebarRef
}: UsePdfCameraArgs) {
  const cameraRef = useRef<CameraState>(INITIAL_CAMERA)
  const currentPageRef = useRef(1)

  const pushCameraRaw = useCallback(
    (patch: Partial<CameraState>) => {
      const next = { ...cameraRef.current, ...patch }
      cameraRef.current = next
      pdfLayerRef.current?.applyCamera(next)
      // EmbedActivateHint lives under Excalidraw scale(zoom); counter-scale via CSS var.
      containerRef.current?.style.setProperty('--canvas-zoom', String(next.zoom))

      const layout = sessionRef.current?.layout
      if (layout) {
        const index = layout.pageIndexForCamera(next)
        const page1Based = index != null ? index + 1 : 1
        if (page1Based !== currentPageRef.current) {
          currentPageRef.current = page1Based
          pageNavigatorRef.current?.setCurrentPage(page1Based)
          pdfSidebarRef.current?.setActivePage(page1Based)
        }
      }
    },
    [containerRef, pageNavigatorRef, pdfLayerRef, pdfSidebarRef, sessionRef]
  )

  return { cameraRef, currentPageRef, pushCameraRaw }
}

export type { RuntimeSessionLike }
