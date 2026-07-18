import { usePdfJump } from '@anaralabs/lector'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@renderer/components/ui/context-menu'
import { createColorPalette } from '@renderer/lib/colors'
import { getRelativeTimeString } from '@renderer/lib/date'
import { getHighlightColor } from '@renderer/lib/highlight-colors'
import { compareHighlightsByPosition } from '@renderer/lib/sort-highlights'
import { type Pdf, usePdfs } from '@renderer/stores/categories'
import { DynamicIcon } from 'lucide-react/dynamic'
import { useEffect } from 'react'

type Props = {
  highlights: Pdf['highlights']
  categoryId: string
  pdfId: string
  selectedHighlight: NonNullable<Pdf['highlights']>[0] | null
  setSelectedHighlight: (highlight: NonNullable<Pdf['highlights']>[0] | null) => void
  tabRef: React.RefObject<HTMLDivElement | null>
}

function HighlightCardsTemplate({
  highlights,
  categoryId,
  pdfId,
  selectedHighlight,
  setSelectedHighlight,
  tabRef
}: Props) {
  const { jumpToHighlightRects } = usePdfJump()
  const deleteHighlight = usePdfs((s) => s.removeHighlightFromPdf)
  const deleteCommentFromHighlight = usePdfs((s) => s.deleteCommentFromHighlight)

  useEffect(() => {
    if (selectedHighlight) {
      const target = tabRef.current?.querySelector(
        `[data-highlight-id="${selectedHighlight.id}"]`
      ) as HTMLElement
      if (target) {
        tabRef.current?.scrollTo({
          top: target.offsetTop + target.offsetHeight / 2 - tabRef.current?.offsetHeight / 2,
          behavior: 'smooth'
        })
      }
    }
  }, [selectedHighlight, tabRef])
  function goToHighlight(highlight: NonNullable<Pdf['highlights']>[0]) {
    jumpToHighlightRects(highlight.rects, 'pixels', 'start')
    setSelectedHighlight(highlight)
  }

  if (!highlights || highlights.length === 0) {
    return (
      <div className="flex flex-col gap-2 justify-center items-center py-8 px-2">
        <h3 className="text-xl font-medium font-serif mb-4">Highlight key passages</h3>
        <DynamicIcon
          name="highlighter"
          className="size-40 text-morphing-300 opacity-60 mb-2"
        />
        <a
          href="https://www.google.com/search?q=benefits+of+highlighting+while+reading"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-morphing-500 mb-4 underline hover:text-morphing-700 text-center"
        >
          Highlighting helps you remember what matters.
        </a>
        <p className="text-sm text-morphing-500 text-center">
          Select text in the PDF to add your first highlight.
        </p>
      </div>
    )
  }

  return highlights
    .sort((a, b) => compareHighlightsByPosition(a, b))
    .map((highlight) => {
      const isSelected = selectedHighlight?.id === highlight.id
      const { bg } = isSelected ? createColorPalette('#fff') : getHighlightColor(highlight.color)
      return (
        <div key={highlight.id} className={'group mb-8 block w-full'}>
          <ContextMenu key={highlight.id}>
            <ContextMenuTrigger asChild>
              <button
                className="w-full"
                data-highlight-id={highlight.id}
                type="button"
                onClick={() => {
                  goToHighlight(highlight)
                }}
              >
                <header
                  className="flex cursor-pointer justify-between border items-center gap-1 mx-3 rounded-t-xl text-xs px-2 py-1"
                  style={{
                    backgroundColor: `rgb(${bg[50]})`,
                    color: `rgb(${bg[900]})`,
                    borderColor: `rgb(${bg[200]})`
                  }}
                >
                  <p>
                    {'Page '}
                    {highlight.rects[0]?.pageNumber}
                  </p>
                  <p>{getRelativeTimeString(new Date(highlight.createdAt))}</p>
                </header>
                <pre
                  className={
                    'cursor-pointer rounded-xl overflow-clip p-2 w-full font-serif tracking-tight border whitespace-pre-wrap text-left select-none'
                  }
                  style={{
                    color: `rgb(${bg[800]})`,
                    backgroundColor: `rgb(${bg[200]})`,
                    borderColor: `rgb(${bg[300]})`
                  }}
                >
                  {highlight.text}
                </pre>
              </button>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem
                className="group"
                data-copied={false}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  const target = e.target as HTMLElement
                  if (target.getAttribute('data-copied') === 'true') {
                    return
                  }
                  navigator.clipboard.writeText(highlight.text).then(() => {
                    target.dataset.copied = 'true'
                    setTimeout(() => {
                      target.dataset.copied = 'false'
                    }, 1000)
                  })
                }}
              >
                <DynamicIcon
                  name="copy"
                  className="size-4 text-morphing-900 group-data-[copied=false]:block group-data-[copied=true]:hidden"
                />
                <DynamicIcon
                  name="check"
                  className="size-4 text-morphing-900 hidden group-data-[copied=true]:block"
                />
                <p>Copy</p>
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                variant="destructive"
                onClick={() => {
                  deleteHighlight(categoryId, pdfId, highlight.id)
                }}
              >
                <DynamicIcon name="trash" className="size-4 text-morphing-900" />
                <p>Delete</p>
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>

          <ol
            className="w-[calc(100%-20px)] text-morphing-800 border px-2 mx-auto rounded-b-xl text-sm"
            style={{
              backgroundColor: `rgb(${bg[50]})`,
              borderColor: `rgb(${bg[200]})`
            }}
          >
            {highlight.comments?.map((comment) => (
              <ContextMenu key={comment.id}>
                <ContextMenuTrigger asChild>
                  <li
                    key={comment.id}
                    className="py-2 border-b cursor-pointer"
                    style={{
                      borderColor: `rgb(${bg[200]})`
                    }}
                  >
                    <pre className="mb-1 font-sans whitespace-pre-wrap">{comment.text}</pre>
                    <time className="text-morphing-500 text-xs" dateTime={comment.createdAt.toString()}>
                      {getRelativeTimeString(new Date(comment.createdAt))}
                    </time>
                  </li>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem
                    variant="destructive"
                    onClick={() => {
                      deleteCommentFromHighlight(categoryId, pdfId, highlight.id, comment.id)
                    }}
                  >
                    <DynamicIcon name="trash" className="size-4" />
                    <p>Delete</p>
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
            <li className="text-morphing-500 py-2">
              <button
                onClick={() => {
                  goToHighlight(highlight)
                }}
                type="button"
                className="hover:text-morphing-800 transition-colors duration-200 cursor-pointer"
              >
                Add comment
              </button>
            </li>
          </ol>
        </div>
      )
    })
}

export default HighlightCardsTemplate
