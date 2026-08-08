import {
  ContextMenuContent as AnimatedContextMenuContent,
  ContextMenuItem as AnimatedContextMenuItem,
  ContextMenuSeparator as AnimatedContextMenuSeparator
} from '@renderer/components/ui/context-menu-animated'
import {
  ContextMenuContent as ClassicContextMenuContent,
  ContextMenuItem as ClassicContextMenuItem,
  ContextMenuSeparator as ClassicContextMenuSeparator
} from '@renderer/components/ui/context-menu'
import { Input } from '@renderer/components/ui/input'
import { useLang } from '@renderer/i18n/lang-context'
import { type Pdf, usePdfs } from '@renderer/stores/categories'
import { DynamicIcon } from 'lucide-react/dynamic'
import { useDebounceCallback } from 'usehooks-ts'

type Props = {
  pdf: Pdf
  categoryId: string
  /** Use the cinematic animated context menu (category + home pages); classic otherwise (sidebar). */
  animated?: boolean
}

function PdfCardContextMenuContent({ pdf, categoryId, animated = false }: Props) {
  const Content = animated ? AnimatedContextMenuContent : ClassicContextMenuContent
  const Item = animated ? AnimatedContextMenuItem : ClassicContextMenuItem
  const Separator = animated ? AnimatedContextMenuSeparator : ClassicContextMenuSeparator
  const { t, lang } = useLang()
  const deletePdf = usePdfs((s) => s.deletePdf)
  const updatePdf = usePdfs((s) => s.updatePdf)
  const debouncedUpdatePdf = useDebounceCallback((categoryId, pdfId, name) => {
    updatePdf(categoryId, pdfId, { name })
  }, 300)
  const highlightsNumber = pdf.canvasStats?.highlights
  const notesNumber = pdf.canvasStats?.notes
  const searchesNumber = pdf.canvasStats?.searches
  return (
    <Content className="w-3xs">
      <Input
        className="text-morphing-900 flex items-center gap-2 text-lg font-medium px-2 py-2 border-b mb-2 resize-none border-none rounded-b-none rounded-t-lg"
        defaultValue={pdf.name}
        onChange={(e) => {
          if (e.target.value) debouncedUpdatePdf(categoryId, pdf.id, e.target.value.trim())
        }}
      />

      {Boolean(highlightsNumber || notesNumber || searchesNumber) && (
        <div className="flex items-center gap-2 px-2 mb-2">
          {Boolean(highlightsNumber && highlightsNumber > 0) && (
            <>
              <DynamicIcon name="highlighter" className="size-4" />
              <span className="text-sm text-morphing-700">{highlightsNumber}</span>
            </>
          )}
          {Boolean(notesNumber && notesNumber > 0) && (
            <>
              <DynamicIcon name="message-circle" className="size-4" />
              <span className="text-sm text-morphing-700">{notesNumber}</span>
            </>
          )}
          {Boolean(searchesNumber && searchesNumber > 0) && (
            <>
              <DynamicIcon name="globe" className="size-4" />
              <span className="text-sm text-morphing-700">{searchesNumber}</span>
            </>
          )}
        </div>
      )}
      <p className="text-sm text-morphing-700 px-2 mb-2">
        {t('pdfcard_read_progress', {
          read: pdf.progress.pages,
          pages: pdf.pages
        })}{' '}
        <i className="font-serif tracking-tighter">({pdf.progress.percentage.toFixed(0)}%)</i>
      </p>

      <Separator className="mb-2" />

      <p className="text-xs text-morphing-700 px-2">
        <u>{t('pdfcard_author_label')}</u>: {pdf.author}
      </p>
      {pdf.creationDate && (
        <p className="text-xs text-morphing-700 px-2">
          <u>{t('pdfcard_created_label')}</u>: {pdf.creationDate?.toLocaleDateString(lang)}
        </p>
      )}
      {pdf.modificationDate && (
        <p className="text-xs text-morphing-700 px-2">
          <u>{t('pdfcard_modified_label')}</u>: {pdf.modificationDate?.toLocaleDateString(lang)}
        </p>
      )}
      <p className="text-xs text-morphing-700 px-2">
        <u>{t('pdfcard_size_label')}</u>: {pdf.size} bytes
      </p>
      <p className="text-xs text-morphing-700 px-2">
        <u>{t('pdfcard_pages_label')}</u>: {pdf.pages}
      </p>
      <p className="text-xs text-morphing-700 px-2">
        <u>{t('pdfcard_filename_label')}</u>: {pdf.filename}
      </p>
      <p className="text-xs text-morphing-700 px-2">
        <u>{t('pdfcard_id_label')}</u>: {pdf.id}
      </p>

      <Separator />
      <Item
        variant="destructive"
        onClick={() => {
          deletePdf(categoryId, pdf.id)
        }}
      >
        <DynamicIcon name="trash" />
        {t('pdfcard_delete')}
      </Item>
    </Content>
  )
}

export default PdfCardContextMenuContent
