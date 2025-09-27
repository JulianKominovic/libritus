import {
  AnnotationLayer,
  calculateHighlightRects,
  CanvasLayer,
  HighlightLayer,
  Outline,
  OutlineChildItems,
  OutlineItem,
  Page,
  Pages,
  Root,
  Search,
  TextLayer,
  usePdf,
  usePdfJump,
  useSearch
} from '@anaralabs/lector'
import { Button } from '@renderer/components/ui/button'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup
} from '@renderer/components/ui/resizable'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { useDebounceFunction } from '@renderer/hooks/use-debounce-function'
import { centerScrollX } from '@renderer/lib/dom'
import { cn } from '@renderer/lib/utils'
import CustomHighlightLayer from '@renderer/organisms/pdf/custom-highlight-layer'
import EssayTab from '@renderer/organisms/pdf/essays-tab'
import HighlightCardsTemplate from '@renderer/organisms/pdf/highlight-card'
import { type Pdf, usePdfs } from '@renderer/stores/categories'
import { useSettings } from '@renderer/stores/settings'
import FloatingControls from '@renderer/templates/pdf/floating-controls'
import SelectionMenu from '@renderer/templates/pdf/text-selection-menu'
import { DynamicIcon } from 'lucide-react/dynamic'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ImperativePanelHandle } from 'react-resizable-panels'
import { useDebounceCallback } from 'usehooks-ts'
import { Redirect, useParams } from 'wouter'

function CustomOutline({
  selectedHighlight,
  highlights,
  categoryId,
  pdfId,
  setSelectedHighlight,
  pdf
}: {
  selectedHighlight: NonNullable<Pdf['highlights']>[0] | null
  highlights: Pdf['highlights']
  categoryId: string
  pdfId: string
  setSelectedHighlight: (highlight: NonNullable<Pdf['highlights']>[0] | null) => void
  pdf: Pdf
}) {
  const highlightTabRef = useRef<HTMLDivElement>(null)
  return (
    <Tabs className="w-full h-full min-h-0 px-4 overscroll-contain" defaultValue="highlights">
      <TabsList className="w-full px-1">
        <TabsTrigger className="h-[30px]" value="highlights">
          <DynamicIcon name="highlighter" className="size-4" />
        </TabsTrigger>
        <TabsTrigger className="h-[30px]" value="essays">
          <DynamicIcon name="file-pen-line" className="size-4" />
        </TabsTrigger>
        <TabsTrigger className="h-[30px]" value="chats">
          <DynamicIcon name="bot-message-square" className="size-4" />
        </TabsTrigger>
        <TabsTrigger className="h-[30px]" value="outline">
          <DynamicIcon name="list" className="size-4" />
        </TabsTrigger>
      </TabsList>

      <TabsContent
        ref={highlightTabRef}
        value="highlights"
        className="h-full !overflow-y-auto overflow-x-visible py-4"
      >
        <HighlightCardsTemplate
          highlights={highlights}
          categoryId={categoryId}
          pdfId={pdfId}
          selectedHighlight={selectedHighlight}
          setSelectedHighlight={setSelectedHighlight}
          tabRef={highlightTabRef}
        />
      </TabsContent>
      <TabsContent value="essays" className="h-full overflow-y-auto">
        <EssayTab pdf={pdf} categoryId={categoryId} />
      </TabsContent>
      <TabsContent value="chats">chats.</TabsContent>
      <TabsContent value="outline" className="h-full">
        <Outline
          className={cn(
            '[&__ul]:pl-8 space-y-1 [&__li]:mb-1 [&__li]:text-sm [&__a]:text-morphing-700 [&__a]:cursor-pointer [&__a:hover]:text-morphing-900 select-none w-full h-full pb-20 overflow-y-auto px-4'
          )}
        >
          <OutlineItem>
            <OutlineChildItems />
          </OutlineItem>
        </Outline>
      </TabsContent>
    </Tabs>
  )
}

function SearchUi() {
  const { search, searchResults } = useSearch()
  const debouncedSearch = useDebounceCallback(
    (term: string) => term && search(term, { limit: 100 }),
    1000
  )
  const { jumpToHighlightRects } = usePdfJump()
  const getPdfPageProxy = usePdf((state) => state.getPdfPageProxy)
  const [resultsCursor, setResultsCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey) {
        if (e.key === 'f') {
          inputRef.current?.focus()
          setOpen(true)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  async function handlePrevResult() {
    const newIndex = Math.max(0, resultsCursor - 1)
    setResultsCursor(newIndex)
    const result = searchResults.exactMatches[newIndex]
    const pageProxy = getPdfPageProxy(result.pageNumber)
    const rects = await calculateHighlightRects(pageProxy, {
      pageNumber: result.pageNumber,
      text: result.text,
      matchIndex: result.matchIndex,
      searchText: result.searchText
    })
    jumpToHighlightRects(rects, 'pixels')
  }

  async function handleNextResult() {
    const newIndex = Math.min(searchResults.exactMatches.length - 1, resultsCursor + 1)
    setResultsCursor(newIndex)
    const result = searchResults.exactMatches[newIndex]
    const pageProxy = getPdfPageProxy(result.pageNumber)
    const rects = await calculateHighlightRects(pageProxy, {
      pageNumber: result.pageNumber,
      text: result.text,
      matchIndex: result.matchIndex,
      searchText: result.searchText
    })
    jumpToHighlightRects(rects, 'pixels')
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: <explanation>
    <div
      className={cn(
        'absolute top-2 right-2 w-fit h-10 flex items-center z-10 bg-morphing-50 border border-morphing-300 shadow-md shadow-morphing-900/10 rounded-lg px-2 gap-2',
        open ? 'scale-100 drop-shadow-md shadow-morphing-900/10' : 'scale-0'
      )}
    >
      <input
        spellCheck={false}
        ref={inputRef}
        type="text"
        onChange={(e) => {
          const value = e.target.value
          setResultsCursor(0)
          if (value) debouncedSearch(value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false)
              ; (e.target as HTMLInputElement).blur()
            setResultsCursor(0)
          }
          if (e.key === 'Enter') {
            if (e.shiftKey) handlePrevResult()
            else handleNextResult()
          }
        }}
        className="flex-grow h-full outline-none"
      />
      {searchResults.exactMatches.length > 0 && (
        <p className="text-xs text-morphing-700">
          {resultsCursor + 1} / {searchResults.exactMatches.length}
        </p>
      )}
      <Button
        onClick={handlePrevResult}
        variant="ghost"
        className="rounded-[50%] aspect-square !size-6"
      >
        <DynamicIcon name="chevron-up" className="size-4" />
      </Button>
      <Button
        onClick={handleNextResult}
        variant="ghost"
        className="rounded-[50%] aspect-square !size-6"
      >
        <DynamicIcon name="chevron-down" className="size-4" />
      </Button>
      <Button
        onClick={() => setOpen(false)}
        variant="ghost"
        className="rounded-[50%] aspect-square !size-6"
      >
        <DynamicIcon name="x" className="size-4" />
      </Button>
    </div>
  )
}

function AttachListeners({
  categoryId,
  pdfId,
  pdf
}: {
  categoryId: string
  pdfId: string
  pdf: Pdf
}) {
  const updateZoom = usePdf((s) => s.updateZoom)
  const zoomFitWidth = usePdf((s) => s.zoomFitWidth)
  const zoom = usePdf((s) => s.zoom)
  const isZoomFitWidth = usePdf((s) => s.isZoomFitWidth)
  const updatePdf = usePdfs((s) => s.updatePdf)
  const currentPage = usePdf((s) => s.currentPage)
  const numPages = usePdf((s) => s.pdfDocumentProxy.numPages)
  const pagesElement = document.getElementById(PAGES_COMPONENT_ID) as HTMLDivElement
  const lockPdfHorizontalScroll = useSettings((s) => s.lockPdfHorizontalScroll)
  //   if (lockPdfHorizontalScroll && pagesElement) {
  //     centerScrollX(pagesElement)
  //   }
  useEffect(() => {
    if (lockPdfHorizontalScroll && pagesElement) {
      centerScrollX(pagesElement)
    }
  }, [lockPdfHorizontalScroll, pagesElement, zoom, isZoomFitWidth])

  // biome-ignore lint/correctness/useExhaustiveDependencies: No need to add all dependencies
  useEffect(() => {
    updatePdf(categoryId, pdfId, {
      zoom,
      progress: {
        ...pdf.progress,
        percentage: Math.round((currentPage / numPages) * 100),
        pages: currentPage
      },
      isZoomFitWidth
    })
  }, [isZoomFitWidth, zoom, currentPage])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey) {
        switch (e.key) {
          case '+':
            e.preventDefault()
            e.stopPropagation()
            updateZoom((prev) => prev + 0.05)
            break
          case '-':
            e.preventDefault()
            e.stopPropagation()
            updateZoom((prev) => prev - 0.05)
            break
          case '0':
            e.preventDefault()
            e.stopPropagation()
            zoomFitWidth()
            break
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [updateZoom, zoomFitWidth])
  return null
}

const MAX_OUTLINE_SIZE_PERCENTAGE = 60
const PAGES_COMPONENT_ID = 'pdf-pages'
function PdfPage() {
  const { categoryId, pdfId } = useParams()
  const categories = usePdfs((p) => p.categories)
  const category = categories.find((c) => c.id === categoryId)
  const pdf = category?.pdfs.find((p) => p.id === pdfId)
  const lastOffset = useRef<number>(pdf?.progress.offset || 0)
  const updatePdf = usePdfs((s) => s.updatePdf)
  const [selectedHighlight, setSelectedHighlight] = useState<
    NonNullable<Pdf['highlights']>[0] | null
  >(null)
  const { debounce: debouncedUpdatePdfProgress } = useDebounceFunction(1000)
  const showPdfOutline = useSettings((s) => s.showPdfOutline)
  const setShowPdfOutline = useSettings((s) => s.setShowPdfOutline)
  const [minSize, setMinSize] = useState(20)
  const rootRef = useRef<HTMLDivElement>(null)
  const outlinePanelRef = useRef<ImperativePanelHandle>(null)
  const lockPdfHorizontalScroll = useSettings((s) => s.lockPdfHorizontalScroll)

  useLayoutEffect(() => {
    if (showPdfOutline) {
      outlinePanelRef.current?.expand()
    } else {
      outlinePanelRef.current?.collapse()
    }
  }, [showPdfOutline, outlinePanelRef.current])

  // This makes sure the outline panel is at a reasonable size
  useEffect(() => {
    if (rootRef.current) {
      function calculateMinSize() {
        const rootWidth = rootRef.current?.getBoundingClientRect().width
        if (!rootWidth) return
        const minOutlinePercentage = (350 * 100) / rootWidth
        setMinSize(Math.min(minOutlinePercentage, MAX_OUTLINE_SIZE_PERCENTAGE))
      }
      const resizeObserver = new ResizeObserver(calculateMinSize)
      calculateMinSize()
      resizeObserver.observe(rootRef.current)
      return () => resizeObserver.disconnect()
    }
  }, [rootRef])

  if (!pdf || !categoryId || !pdfId) {
    return <Redirect to="/" />
  }

  return (
    <Root
      ref={rootRef}
      resolution={3}
      isZoomFitWidth={pdf.isZoomFitWidth}
      zoom={pdf.zoom}
      source={pdf.src}
      className={cn('w-full h-full overflow-hidden relative select-auto gap-0 pl-4')}
      loader={
        <div className="w-full max-w-sm p-4 mx-auto">
          <img
            src={pdf?.thumbnail}
            alt={pdf?.name}
            className="object-cover w-full h-auto mb-4 rounded-md"
          />
          <p className="mb-2 text-lg font-medium text-center text-morphing-700">Loading PDF...</p>
          <DynamicIcon name="loader-2" className="mx-auto size-8 animate-spin text-morphing-700" />
        </div>
      }
    >
      <ResizablePanelGroup
        direction="horizontal"
        className="relative w-full h-full px-0 overflow-x-hidden overflow-y-auto"
      >
        <ResizablePanel minSize={30} order={1} id="pdf-page-panel" className="relative">
          <Pages
            id={PAGES_COMPONENT_ID}
            className={cn(
              'h-full',
              lockPdfHorizontalScroll ? '!overflow-x-hidden' : '!overflow-x-auto'
            )}
            onOffsetChange={(offset) => {
              if (offset === lastOffset.current) return
              debouncedUpdatePdfProgress(() => {
                updatePdf(categoryId, pdfId, {
                  progress: {
                    ...pdf.progress,
                    offset
                  }
                })
              })
              lastOffset.current = offset
            }}
            initialOffset={pdf.progress.offset}
          >
            <Page data-pdf-page>
              <CanvasLayer background={'transparent'} />
              <TextLayer className="bg-morphing-50 mix-blend-multiply" />
              <AnnotationLayer />
              <HighlightLayer className="pointer-events-none bg-amber-500/20" />
              <CustomHighlightLayer
                highlights={pdf.highlights}
                selectedHighlight={selectedHighlight}
                setSelectedHighlight={setSelectedHighlight}
                categoryId={categoryId}
                pdfId={pdfId}
              />
            </Page>
          </Pages>
          <Search>
            <SearchUi />
          </Search>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel
          ref={outlinePanelRef}
          id="pdf-outline-panel"
          maxSize={60}
          minSize={minSize}
          defaultSize={minSize}
          collapsible
          order={2}
          onCollapse={() => setShowPdfOutline(false)}
        >
          <CustomOutline
            pdf={pdf}
            selectedHighlight={selectedHighlight}
            highlights={pdf.highlights}
            categoryId={categoryId}
            pdfId={pdfId}
            setSelectedHighlight={setSelectedHighlight}
          />
        </ResizablePanel>
      </ResizablePanelGroup>

      <SelectionMenu categoryId={categoryId} pdfId={pdfId} />

      <FloatingControls />

      <AttachListeners categoryId={categoryId} pdfId={pdfId} pdf={pdf} />
    </Root>
  )
}

export default PdfPage
