/** biome-ignore-all lint/suspicious/noArrayIndexKey: I know what I'm doing 🔥🚒🧨 */
import { usePDFPageNumber } from '@anaralabs/lector'
import { DynamicIcon } from 'lucide-react/dynamic'
import { useState } from 'react'
import { Button } from '@renderer/components//ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components//ui/popover'
import { Textarea } from '@renderer/components//ui/textarea'
import { getHightBaseColor } from '@renderer/lib/highlight-colors'
import { type Pdf, usePdfs } from '@renderer/stores/categories'

function Highlight({
  h,
  r,
  isSelected,
  setSelectedHighlight,
  categoryId,
  pdfId,
  isNoteModalOpen
}: {
  h: NonNullable<Pdf['highlights']>[0]
  r: NonNullable<Pdf['highlights']>[0]['rects'][0]
  isSelected: boolean
  isNoteModalOpen: boolean
  setSelectedHighlight: (highlight: NonNullable<Pdf['highlights']>[0] | null) => void
  categoryId: string
  pdfId: string
}) {
  const addCommentToHighlight = usePdfs((s) => s.addCommentToHighlight)
  const removeHighlightFromPdf = usePdfs((s) => s.removeHighlightFromPdf)
  const [confirmDelete, setConfirmDelete] = useState(false)
  return (
    <Popover
      open={isNoteModalOpen}
      onOpenChange={(open) => {
        setSelectedHighlight(open ? h : null)
      }}
    >
      <PopoverTrigger asChild>
        <button
          data-highlight-id={h.id}
          type="button"
          className="absolute rounded-sm select-none cursor-pointer opacity-30 hover:opacity-50"
          style={{
            left: r.left,
            top: r.top,
            width: r.width,
            height: r.height,
            backgroundColor: isSelected ? '#595959' : getHightBaseColor(h.color)
          }}
        />
      </PopoverTrigger>
      <PopoverContent className="bg-transparent border-none shadow-none max-w-md w-full">
        <form
          className="bg-white p-2 mb-2 border border-morphing-300 rounded-xl"
          onSubmit={(e) => {
            e.preventDefault()
            const formData = new FormData(e.target as HTMLFormElement)
            const text = (formData.get('text') as string).trim()
            if (text) {
              addCommentToHighlight(categoryId, pdfId, h.id, {
                text,
                id: crypto.randomUUID(),
                createdAt: new Date(),
                updatedAt: new Date()
              })
              setSelectedHighlight(null)
            }
          }}
        >
          <Textarea className="mb-2 resize-none" name="text" />

          <Button variant={'default'} type="submit" className="!text-sm">
            Save
          </Button>
        </form>
        <div className="bg-gradient-to-tr from-white via-violet-50 to-white border border-violet-300 shadow-lg shadow-violet-900/20 mb-2 rounded-xl max-w-sm p-1 flex items-center flex-wrap w-fit">
          <Button
            variant={'ghost'}
            className="!px-2 !text-xs rounded-lg hover:bg-violet-100 text-violet-900 hover:text-violet-900"
          >
            <DynamicIcon name="bot-message-square" className="size-4" />
            <p>Chat with AI</p>
          </Button>
          <Button
            variant={'ghost'}
            className="!px-2 !text-xs rounded-lg hover:bg-violet-100 text-violet-900 hover:text-violet-900"
          >
            <DynamicIcon name="help-circle" className="size-4" />
            <p>What does this mean?</p>
          </Button>
        </div>
        <div className="bg-gradient-to-tr from-white via-red-50 to-white border border-red-300 shadow-lg shadow-red-900/20 mb-2 rounded-xl text-sm max-w-sm p-1 flex items-center gap-2 flex-wrap w-fit">
          {confirmDelete ? (
            <Button
              variant={'none'}
              type="button"
              className="!text-sm "
              onClick={() => {
                setConfirmDelete(false)
              }}
            >
              Cancel
            </Button>
          ) : null}
          <Button
            variant={'ghost'}
            type="button"
            className="!text-sm rounded-lg hover:bg-red-100 text-red-700 hover:text-red-700"
            onClick={() => {
              setConfirmDelete(true)
              if (confirmDelete) {
                setConfirmDelete(false)
                setSelectedHighlight(null)
                removeHighlightFromPdf(categoryId, pdfId, h.id)
              }
            }}
          >
            {confirmDelete ? 'Confirm delete' : 'Delete highlight'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default function CustomHighlightLayer({
  highlights,
  setSelectedHighlight,
  selectedHighlight,
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

  return highlights
    ?.filter((r) => r.rects.some((re) => re.pageNumber === pageNumber))
    .flatMap((h, idx) =>
      h.rects
        .filter((rect) => rect.left > 0 && rect.top > 0 && rect.pageNumber === pageNumber)
        .map((r, i) => {
          const isSelected = h.id === selectedHighlight?.id
          const isNoteModalOpen = isSelected && i === 0
          return (
            <Highlight
              key={idx + r.pageNumber + (h?.id ?? '') + i}
              h={h}
              r={r}
              setSelectedHighlight={setSelectedHighlight}
              isSelected={isSelected}
              categoryId={categoryId}
              pdfId={pdfId}
              isNoteModalOpen={isNoteModalOpen}
            />
          )
        })
    )
}
