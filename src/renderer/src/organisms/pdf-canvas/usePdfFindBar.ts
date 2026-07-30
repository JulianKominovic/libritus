import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { PageLayout } from '@renderer/lib/pdf-canvas/PageLayout'
import { PdfDocument } from '@renderer/lib/pdf-canvas/PdfDocument'
import { PdfTextSearch, type SearchMatch } from '@renderer/lib/pdf-canvas/pdfSearch'
import type { CameraState } from '@renderer/lib/pdf-canvas/types'
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { PdfFindBarHandle } from './PdfFindBar'
import type { PdfLayerHandle } from './PdfLayer'

type UsePdfFindBarArgs = {
  /** When set, owns a PdfTextSearch for this document; cleared on null. */
  doc: PdfDocument | null
  apiRef: RefObject<ExcalidrawImperativeAPI | null>
  cameraRef: RefObject<CameraState>
  pdfLayerRef: RefObject<PdfLayerHandle | null>
  getLayout: () => PageLayout | null
  pushCamera: (partial: Partial<CameraState>) => void
  markUnsaved: () => void
}

export function usePdfFindBar({
  doc,
  apiRef,
  cameraRef,
  pdfLayerRef,
  getLayout,
  pushCamera,
  markUnsaved
}: UsePdfFindBarArgs) {
  const findBarRef = useRef<PdfFindBarHandle>(null)
  const searcherRef = useRef<PdfTextSearch | null>(null)
  const matchesRef = useRef<SearchMatch[]>([])
  const matchIndexRef = useRef(-1)
  const searchAbortRef = useRef<AbortController | null>(null)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [findOpen, setFindOpen] = useState(false)

  const clearSearchUi = useCallback(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = null
    searchAbortRef.current?.abort()
    searchAbortRef.current = null
    matchesRef.current = []
    matchIndexRef.current = -1
    pdfLayerRef.current?.setSearchHit(null)
  }, [pdfLayerRef])

  useEffect(() => {
    if (!doc) {
      clearSearchUi()
      searcherRef.current = null
      setFindOpen(false)
      return
    }
    searcherRef.current = new PdfTextSearch(doc)
    return () => {
      clearSearchUi()
      searcherRef.current?.clear()
      searcherRef.current = null
      pdfLayerRef.current?.setSearchHit(null)
    }
  }, [clearSearchUi, doc, pdfLayerRef])

  const goToMatch = useCallback(
    (index: number) => {
      const matches = matchesRef.current
      if (matches.length === 0) return

      const i = ((index % matches.length) + matches.length) % matches.length
      matchIndexRef.current = i
      const hit = matches[i]!
      findBarRef.current?.setMatchInfo(i + 1, matches.length)
      pdfLayerRef.current?.setSearchHit(hit)

      const layout = getLayout()
      const api = apiRef.current
      if (!layout || !api) return

      const page = layout.pages[hit.pageIndex]
      if (!page) return
      const rect = hit.rects[0]
      const worldY = rect ? page.y + rect.y + rect.height / 2 : page.y + page.height / 2
      const target = layout.scrollForWorldY(worldY, cameraRef.current)
      pushCamera({ scrollY: target.scrollY })
      api.updateScene({
        appState: {
          scrollY: target.scrollY
        }
      })
      markUnsaved()
    },
    [apiRef, cameraRef, getLayout, markUnsaved, pdfLayerRef, pushCamera]
  )

  const runSearch = useCallback(
    (query: string) => {
      searchAbortRef.current?.abort()
      matchesRef.current = []
      matchIndexRef.current = -1
      pdfLayerRef.current?.setSearchHit(null)
      findBarRef.current?.setMatchInfo(0, 0)

      const searcher = searcherRef.current
      if (!searcher || !query.trim()) return

      const ac = new AbortController()
      searchAbortRef.current = ac
      let jumped = false

      void searcher
        .search(query, {
          signal: ac.signal,
          onProgress: ({ matches }) => {
            matchesRef.current = matches
            if (matches.length === 0) {
              findBarRef.current?.setMatchInfo(0, 0)
              return
            }
            if (!jumped) {
              jumped = true
              goToMatch(0)
            } else {
              findBarRef.current?.setMatchInfo(matchIndexRef.current + 1, matches.length)
            }
          }
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return
          console.error(err)
        })
    },
    [goToMatch, pdfLayerRef]
  )

  const handleFindQueryChange = useCallback(
    (query: string) => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
      searchDebounceRef.current = setTimeout(() => runSearch(query), 250)
    },
    [runSearch]
  )

  const closeFind = useCallback(() => {
    clearSearchUi()
    setFindOpen(false)
  }, [clearSearchUi])

  const toggleFind = useCallback(() => {
    setFindOpen((prev) => {
      if (prev) {
        clearSearchUi()
        return false
      }
      return true
    })
  }, [clearSearchUi])

  const goNextMatch = useCallback(() => {
    goToMatch(matchIndexRef.current + 1)
  }, [goToMatch])

  const goPrevMatch = useCallback(() => {
    goToMatch(matchIndexRef.current - 1)
  }, [goToMatch])

  return {
    findOpen,
    findBarRef,
    toggleFind,
    closeFind,
    handleFindQueryChange,
    goNextMatch,
    goPrevMatch
  }
}
