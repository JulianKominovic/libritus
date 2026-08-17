import { ContextMenu, ContextMenuTrigger } from '@renderer/components/ui/context-menu-animated'
import { IconPicker } from '@renderer/components/ui/icon-picker'
import { useLang } from '@renderer/i18n/lang-context'
import { setGlobalTheme } from '@renderer/lib/app-theme'
import { createColorPalette } from '@renderer/lib/colors'
import { cn } from '@renderer/lib/utils'
import PdfCardContextMenuContent from '@renderer/organisms/pdf/pdf-card-context-menu-content'
import { type Pdf, usePdfs } from '@renderer/stores/categories'
import DragAndDropZone from '@renderer/templates/drag-and-drop'
import chroma from 'chroma-js'
import { DynamicIcon } from 'lucide-react/dynamic'
import { useLayoutEffect } from 'react'
import { useDrag } from 'react-dnd'
import { useDebounceCallback } from 'usehooks-ts'
import { Link, Redirect, useParams } from 'wouter'
import { UrlToPdfForm } from './UrlToPdfForm'

const SLOW_DEBOUNCE_TIME = 350
const FAST_DEBOUNCE_TIME = 50

/** Custom type — NativeTypes.HTML makes HTML5Backend treat the card as a native drag (dragleave can end it mid-flight). */
const PDF_CARD_DRAG_TYPE = 'libritus/pdf-card'

const pdfStatPillClassName =
  'px-2 text-morphing-800 h-6 bg-morphing-100/80 border border-morphing-300 backdrop-blur-lg rounded-full flex items-center gap-1 tabular-nums'

function DraggablePdfCard({ pdf, categoryId }: { pdf: Pdf; categoryId: string }) {
  const { t } = useLang()
  const updatePdf = usePdfs((s) => s.updatePdf)
  const debouncedUpdateName = useDebounceCallback((name: string) => {
    updatePdf(categoryId, pdf.id, { name })
  }, SLOW_DEBOUNCE_TIME)
  const [, drag, preview] = useDrag(() => ({
    type: PDF_CARD_DRAG_TYPE,
    previewOptions: {
      offsetX: -1,
      offsetY: 320
    },
    options: { dropEffect: 'move' },
    item: { id: pdf.id, type: 'P' as const }
  }))
  const highlightsNumber = pdf.canvasStats?.highlights
  const notesNumber = pdf.canvasStats?.notes
  const searchesNumber = pdf.canvasStats?.searches
  const essaysNumber = pdf.essays?.length
  return (
    <div key={pdf.id} className="flex w-56 flex-col gap-2">
      <ContextMenu>
        <ContextMenuTrigger ref={drag as unknown as React.Ref<HTMLDivElement>}>
          <Link
            to={`/category/${categoryId}/${pdf.id}`}
            className={
              'p-0 flex flex-col justify-center items-center h-80 w-56 object-contain bg-morphing-100 relative group pdf-card-content [--radius:16px] transition-[transform,box-shadow] duration-200 shadow-sm shadow-morphing-200 [@media(hover:hover)_and_(pointer:fine)]:hover:shadow-2xl group'
            }
          >
            <img
              ref={preview as unknown as React.Ref<HTMLImageElement>}
              src={pdf.thumbnail || ''}
              alt={pdf.name}
              className={'size-full object-cover'}
            />
            <div className="absolute bottom-1.5 text-xs right-1.5 w-fit flex items-center gap-1">
              {essaysNumber && essaysNumber > 0 ? (
                <p className={pdfStatPillClassName}>
                  <DynamicIcon name="file-pen-line" className="size-4 text-morphing-700" />
                  {essaysNumber}
                </p>
              ) : null}
              {notesNumber && notesNumber > 0 ? (
                <p className={pdfStatPillClassName}>
                  <DynamicIcon name="message-circle" className="size-4 text-morphing-700" />
                  {notesNumber}
                </p>
              ) : null}
              {searchesNumber && searchesNumber > 0 ? (
                <p className={pdfStatPillClassName}>
                  <DynamicIcon name="globe" className="size-4 text-morphing-700" />
                  {searchesNumber}
                </p>
              ) : null}
              {highlightsNumber && highlightsNumber > 0 ? (
                <p className={pdfStatPillClassName}>
                  <DynamicIcon name="highlighter" className="size-4 text-morphing-700" />
                  {highlightsNumber}
                </p>
              ) : null}
              <p className={pdfStatPillClassName}>
                {pdf.progress.percentage > 0 ? (
                  `${pdf.progress.percentage.toFixed(0)}%`
                ) : (
                  <i className="font-serif">{t('home_pdf_new_badge')}</i>
                )}
              </p>
            </div>
          </Link>
        </ContextMenuTrigger>
        <PdfCardContextMenuContent animated pdf={pdf} categoryId={categoryId} />
      </ContextMenu>
      <input
        key={`pdf-name-${pdf.id}`}
        className="w-full truncate bg-transparent text-center text-sm text-morphing-800 focus:outline-0"
        defaultValue={pdf.name}
        title={pdf.name}
        onChange={(e) => {
          const name = e.target.value.trim()
          if (name) debouncedUpdateName(name)
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      />
    </div>
  )
}

function Category() {
  const { categoryId } = useParams()
  const { t } = useLang()

  const categories = usePdfs((p) => p.categories)
  const updateCategory = usePdfs((p) => p.updateCategory)
  const updateTitle = useDebounceCallback((title: string) => {
    updateCategory(categoryId || '', {
      name: title
    })
  }, SLOW_DEBOUNCE_TIME)
  const updateDescription = useDebounceCallback((description: string) => {
    updateCategory(categoryId || '', { description })
  }, SLOW_DEBOUNCE_TIME)
  const updateColor = useDebounceCallback((color: string) => {
    const hex = chroma(color).hex()
    updateCategory(categoryId || '', { color: hex })
    setGlobalTheme(createColorPalette(hex || '#555'))
  }, SLOW_DEBOUNCE_TIME)
  const fastUpdateColor = useDebounceCallback((color: string) => {
    const hex = chroma(color).hex()
    setGlobalTheme(createColorPalette(hex || '#555'))
  }, FAST_DEBOUNCE_TIME)
  const uploadPdf = usePdfs((p) => p.uploadPdf)
  const category = categories.find((c) => c.id === categoryId)

  useLayoutEffect(() => {
    setGlobalTheme(createColorPalette(category?.color || '#555'))
  }, [category?.color])

  if (!category || !categoryId) {
    return <Redirect to="/" />
  }

  const isDefault = categoryId === 'default'

  return (
    <DragAndDropZone>
      <div className="flex items-center gap-2 pt-4">
        <div
          className={cn(
            'cursor-pointer size-10 rounded-[50%] overflow-hidden aspect-square border-morphing-600 border transition-transform flex-shrink-0',
            isDefault ? '' : '[@media(hover:hover)_and_(pointer:fine)]:hover:scale-110'
          )}
        >
          <input
            key={`color-${categoryId}`}
            disabled={isDefault}
            readOnly={isDefault}
            type="color"
            name="color"
            id={`color-${categoryId}`}
            className={cn('size-full')}
            defaultValue={category.color}
            onChange={(e) => {
              updateColor(e.target.value)
              fastUpdateColor(e.target.value)
            }}
          />
        </div>
        {isDefault ? null : (
          <IconPicker
            className="size-8 flex-shrink-0"
            defaultValue={category.icon}
            onValueChange={(icon) => updateCategory(categoryId, { icon })}
          >
            <DynamicIcon name={category.icon} size={24} />
          </IconPicker>
        )}

        <input
          key={`name-${categoryId}`}
          disabled={isDefault}
          className={cn(
            isDefault ? 'cursor-default' : 'cursor-text',
            'text-5xl font-semibold tracking-tighter font-serif w-full block focus:outline-0 min-w-40 text-morphing-900'
          )}
          defaultValue={category.name}
          onChange={(e) => updateTitle(e.target.value)}
          readOnly={isDefault}
        />
      </div>
      <textarea
        key={`description-${categoryId}`}
        disabled={isDefault}
        className={cn(
          isDefault ? 'cursor-default' : 'cursor-text',
          'text-lg text-morphing-700 w-full block focus:outline-0 max-w-md min-w-40 resize-none'
        )}
        defaultValue={category.description}
        onChange={(e) => updateDescription(e.target.value)}
        readOnly={isDefault}
        rows={3}
      />
      <h2 className="mb-6 text-sm tabular-nums text-muted-foreground">
        {t('category_pdf_count', { count: category.pdfs.length })}
      </h2>
      <div className="flex flex-wrap gap-8 group/container">
        {category.pdfs
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
          .map((pdf) => (
            <DraggablePdfCard key={`${pdf.id}card`} pdf={pdf} categoryId={categoryId} />
          ))}
        <div className="flex w-56 flex-col gap-2">
          <label
            htmlFor={`pdf-upload-${categoryId}`}
            className="border-morphing-200 p-4 flex flex-col justify-center items-center rounded-xl border h-80 w-56 bg-morphing-100 hover:bg-morphing-200 transition-colors duration-200"
          >
            <DynamicIcon name="plus" className="size-10 text-morphing-600" />
            <p className="text-morphing-800 text-lg font-medium">{t('category_upload_pdf')}</p>
            <p className="text-sm text-morphing-800">{t('category_drop_hint')}</p>
            <input
              id={`pdf-upload-${categoryId}`}
              type="file"
              placeholder={t('category_upload_pdf')}
              accept="application/pdf"
              hidden
              multiple
              onChange={async (e) => {
                for (const file of e.target.files || []) {
                  console.log('Uploading pdf', file)
                  if (file && file.type === 'application/pdf') {
                    await uploadPdf(categoryId, file)
                  }
                }
              }}
            />
          </label>
          <UrlToPdfForm categoryId={categoryId} />
        </div>
      </div>
    </DragAndDropZone>
  )
}

export default Category
