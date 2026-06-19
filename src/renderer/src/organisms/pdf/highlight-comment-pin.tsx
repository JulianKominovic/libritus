import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '@renderer/components/ui/context-menu'
import { createColorPalette } from '@renderer/lib/colors'
import { getRelativeTimeString } from '@renderer/lib/date'
import { getHighlightColor } from '@renderer/lib/highlight-colors'
import { cn } from '@renderer/lib/utils'
import { type Pdf, usePdfs } from '@renderer/stores/categories'
import { DynamicIcon } from 'lucide-react/dynamic'

export function HighlightCommentCard({
  highlight,
  isSelected,
  onSelect,
  categoryId,
  pdfId,
  className
}: {
  highlight: NonNullable<Pdf['highlights']>[0]
  isSelected: boolean
  onSelect: () => void
  categoryId: string
  pdfId: string
  className?: string
}) {
  const deleteCommentFromHighlight = usePdfs((s) => s.deleteCommentFromHighlight)
  const { bg } = isSelected ? createColorPalette('#fff') : getHighlightColor(highlight.color)

  if (!highlight.comments?.length) return null

  return (
    <button
      type="button"
      data-highlight-pin-id={highlight.id}
      className={cn(
        'w-full text-left rounded-xl border shadow-md shadow-morphing-900/10 text-sm overflow-hidden',
        isSelected && 'ring-2 ring-morphing-400',
        className
      )}
      style={{
        backgroundColor: `rgb(${bg[50]})`,
        borderColor: `rgb(${bg[200]})`
      }}
      onClick={onSelect}
    >
      <ol className="px-2 text-black/80">
        {highlight.comments.map((comment) => (
          <ContextMenu key={comment.id}>
            <ContextMenuTrigger asChild>
              <li
                className="py-2 border-b cursor-pointer"
                style={{ borderColor: `rgb(${bg[200]})` }}
              >
                <pre className="mb-1 font-sans text-xs whitespace-pre-wrap">{comment.text}</pre>
                <time className="text-xs text-black/40" dateTime={comment.createdAt.toString()}>
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
      </ol>
    </button>
  )
}
