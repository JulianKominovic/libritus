import { DynamicIcon } from 'lucide-react/dynamic'
import { useDebounceCallback } from 'usehooks-ts'
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator
} from '@renderer/components//ui/context-menu'
import { Input } from '@renderer/components//ui/input'
import { type Pdf, usePdfs } from '@renderer/stores/categories'

type Props = {
  pdf: Pdf
  categoryId: string
}

function PdfCardContextMenuContent({ pdf, categoryId }: Props) {
  const deletePdf = usePdfs((s) => s.deletePdf)
  const updatePdf = usePdfs((s) => s.updatePdf)
  const debouncedUpdatePdf = useDebounceCallback((categoryId, pdfId, name) => {
    updatePdf(categoryId, pdfId, { name })
  }, 300)
  const highlightsNumber = pdf.highlights?.length
  const commentsNumber = pdf.highlights?.flatMap((h) => h.comments)?.length
  return (
    <ContextMenuContent className="w-3xs">
      <Input
        className="text-morphing-900 flex items-center gap-2 text-lg font-medium px-2 py-2 border-b mb-2 resize-none border-none rounded-b-none rounded-t-lg"
        defaultValue={pdf.name}
        onChange={(e) => {
          if (e.target.value) debouncedUpdatePdf(categoryId, pdf.id, e.target.value.trim())
        }}
      />

      {Boolean(highlightsNumber || commentsNumber) && (
        <div className="flex items-center gap-2 px-2 mb-2">
          {Boolean(highlightsNumber && highlightsNumber > 0) && (
            <>
              <DynamicIcon name="highlighter" className="size-4" />
              <span className="text-sm text-morphing-700">{highlightsNumber}</span>
            </>
          )}
          {Boolean(commentsNumber && commentsNumber > 0) && (
            <>
              <DynamicIcon name="message-circle" className="size-4" />
              <span className="text-sm text-morphing-700">{commentsNumber}</span>
            </>
          )}
        </div>
      )}
      <p className="text-sm text-morphing-700 px-2 mb-2">
        Read {pdf.progress.pages} of {pdf.pages} pages{' '}
        <i className="font-serif tracking-tighter">({pdf.progress.percentage.toFixed(0)}%)</i>
      </p>

      <ContextMenuSeparator className="mb-2" />

      <p className="text-xs text-morphing-700 px-2">
        <u>By</u>: {pdf.author}
      </p>
      {pdf.creationDate && (
        <p className="text-xs text-morphing-700 px-2">
          <u>Created</u>: {pdf.creationDate?.toLocaleDateString()}
        </p>
      )}
      {pdf.modificationDate && (
        <p className="text-xs text-morphing-700 px-2">
          <u>Modified</u>: {pdf.modificationDate?.toLocaleDateString()}
        </p>
      )}
      <p className="text-xs text-morphing-700 px-2">
        <u>Size</u>: {pdf.size} bytes
      </p>
      <p className="text-xs text-morphing-700 px-2">
        <u>Pages</u>: {pdf.pages}
      </p>
      <p className="text-xs text-morphing-700 px-2">
        <u>Filename</u>: {pdf.filename}
      </p>
      <p className="text-xs text-morphing-700 px-2">
        <u>ID</u>: {pdf.id}
      </p>

      <ContextMenuSeparator />
      <ContextMenuItem
        variant="destructive"
        onClick={() => {
          deletePdf(categoryId, pdf.id)
        }}
      >
        <DynamicIcon name="trash" />
        Delete
      </ContextMenuItem>
    </ContextMenuContent>
  )
}

export default PdfCardContextMenuContent
