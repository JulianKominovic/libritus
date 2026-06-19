import { usePDFPageNumber } from '@anaralabs/lector'
import { Button } from '@renderer/components/ui/button'
import { Textarea } from '@renderer/components/ui/textarea'
import {
  ESTIMATED_COMMENT_HEIGHT,
  layoutCommentPositions
} from '@renderer/lib/layout-comment-positions'
import {
  compareHighlightsByPosition,
  getHighlightSortRectOnPage
} from '@renderer/lib/sort-highlights'
import { HighlightCommentCard } from '@renderer/organisms/pdf/highlight-comment-pin'
import { type Pdf, usePdfs } from '@renderer/stores/categories'
import { DynamicIcon } from 'lucide-react/dynamic'
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'

export const COMMENT_GUTTER_WIDTH = 260

function HighlightGutterSlot({
  index,
  highlight,
  anchorTop,
  top,
  isSelected,
  setSelectedHighlight,
  categoryId,
  pdfId,
  onHeightChange
}: {
  index: number
  highlight: NonNullable<Pdf['highlights']>[0]
  anchorTop: number
  top: number
  isSelected: boolean
  setSelectedHighlight: (highlight: NonNullable<Pdf['highlights']>[0] | null) => void
  categoryId: string
  pdfId: string
  onHeightChange: (id: string, height: number) => void
}) {
  const addCommentToHighlight = usePdfs((s) => s.addCommentToHighlight)
  const removeHighlightFromPdf = usePdfs((s) => s.removeHighlightFromPdf)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const slotRef = useRef<HTMLDivElement>(null)
  const hasComments = Boolean(highlight.comments?.length)

  useLayoutEffect(() => {
    const el = slotRef.current
    if (!el) return

    const report = () => onHeightChange(highlight.id, el.getBoundingClientRect().height)
    report()

    const observer = new ResizeObserver(report)
    observer.observe(el)
    return () => observer.disconnect()
  }, [highlight.id, highlight.comments?.length, isSelected, confirmDelete, onHeightChange])

  return (
    <div
      ref={slotRef}
      className="absolute left-0 pointer-events-auto right-2"
      style={{ top, zIndex: index + 1 }}
      data-gutter-highlight-id={highlight.id}
      data-gutter-anchor-top={anchorTop}
    >
      {hasComments ? (
        <HighlightCommentCard
          highlight={highlight}
          isSelected={isSelected}
          onSelect={() => setSelectedHighlight(highlight)}
          categoryId={categoryId}
          pdfId={pdfId}
          className="mb-1"
        />
      ) : null}

      {isSelected ? (
        <>
          <form
            className="p-2 mb-1 border shadow-md bg-morphing-50 border-morphing-300 rounded-xl shadow-morphing-900/10"
            onSubmit={(e) => {
              e.preventDefault()
              const formData = new FormData(e.target as HTMLFormElement)
              const text = (formData.get('text') as string).trim()
              if (text) {
                addCommentToHighlight(categoryId, pdfId, highlight.id, {
                  text,
                  id: crypto.randomUUID(),
                  createdAt: new Date(),
                  updatedAt: new Date()
                })
                setSelectedHighlight(null)
              }
            }}
          >
            <Textarea className="mb-2 resize-none" name="text" placeholder="Add a comment..." />
            <Button variant="default" type="submit" className="w-full !text-sm">
              Save
            </Button>
          </form>

          <div className="flex flex-col w-full gap-1 p-1 mb-1 border shadow-lg border-morphing-300 bg-morphing-100 shadow-morphing-900/10 rounded-xl">
            <Button
              variant="ghost"
              type="button"
              className="w-full justify-start !px-2 !text-xs rounded-lg"
            >
              <DynamicIcon name="bot-message-square" className="size-4" />
              <p>Chat with AI</p>
            </Button>
            <Button
              variant="ghost"
              type="button"
              className="w-full justify-start !px-2 !text-xs rounded-lg"
            >
              <DynamicIcon name="help-circle" className="size-4" />
              <p>What does this mean?</p>
            </Button>
          </div>

          <div className="flex flex-col w-full gap-1 p-1 text-sm border shadow-lg border-destructive/30 bg-morphing-50 shadow-morphing-900/10 rounded-xl">
            {confirmDelete ? (
              <Button
                variant="none"
                type="button"
                className="w-full !text-sm"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </Button>
            ) : null}
            <Button
              variant="ghost"
              type="button"
              className="w-full !text-sm rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                if (confirmDelete) {
                  setConfirmDelete(false)
                  setSelectedHighlight(null)
                  removeHighlightFromPdf(categoryId, pdfId, highlight.id)
                } else {
                  setConfirmDelete(true)
                }
              }}
            >
              {confirmDelete ? 'Confirm delete' : 'Delete highlight'}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  )
}

export default function CommentMarginLayer({
  highlights,
  selectedHighlight,
  setSelectedHighlight,
  categoryId,
  pdfId
}: {
  highlights: Pdf['highlights']
  selectedHighlight: NonNullable<Pdf['highlights']>[0] | null
  setSelectedHighlight: (highlight: NonNullable<Pdf['highlights']>[0] | null) => void
  categoryId: string
  pdfId: string
}) {
  const pageNumber = usePDFPageNumber()
  const [heights, setHeights] = useState<Record<string, number>>({})

  const onHeightChange = useCallback((id: string, height: number) => {
    setHeights((prev) => (prev[id] === height ? prev : { ...prev, [id]: height }))
  }, [])

  const gutterItems = useMemo(() => {
    return (highlights ?? [])
      .filter((h) => h.rects.some((r) => r.pageNumber === pageNumber))
      .filter((h) => Boolean(h.comments?.length) || h.id === selectedHighlight?.id)
      .map((h) => {
        const anchorRect = getHighlightSortRectOnPage(h, pageNumber)
        if (!anchorRect) return null
        return {
          highlight: h,
          anchorTop: anchorRect.top,
          anchorLeft: anchorRect.left,
          id: h.id
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => compareHighlightsByPosition(a.highlight, b.highlight, pageNumber))
  }, [highlights, pageNumber, selectedHighlight?.id])

  const positions = useMemo(() => {
    return layoutCommentPositions(
      gutterItems.map((item) => ({
        id: item.id,
        anchorTop: item.anchorTop,
        anchorLeft: item.anchorLeft,
        height: heights[item.id] ?? ESTIMATED_COMMENT_HEIGHT
      }))
    )
  }, [gutterItems, heights])

  const sortedPositions = useMemo(() => [...positions].sort((a, b) => a.top - b.top), [positions])

  return (
    <div
      className="absolute top-0 z-20 pointer-events-none"
      style={{
        right: -COMMENT_GUTTER_WIDTH,
        width: COMMENT_GUTTER_WIDTH,
        height: '100%'
      }}
    >
      {sortedPositions.map((position, index) => {
        const item = gutterItems.find((i) => i.id === position.id)
        if (!item) return null
        const isSelected = selectedHighlight?.id === item.highlight.id

        return (
          <HighlightGutterSlot
            key={item.id}
            index={sortedPositions.length - index}
            highlight={item.highlight}
            anchorTop={item.anchorTop}
            top={position.top}
            isSelected={isSelected}
            setSelectedHighlight={setSelectedHighlight}
            categoryId={categoryId}
            pdfId={pdfId}
            onHeightChange={onHeightChange}
          />
        )
      })}
    </div>
  )
}
