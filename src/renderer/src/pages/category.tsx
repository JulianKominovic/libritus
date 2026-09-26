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
import { useLayoutEffect, useState } from 'react'
import { useDrag } from 'react-dnd'
import { useDebounceCallback } from 'usehooks-ts'
import { Link, Redirect, useParams } from 'wouter'
import { UrlToPdfForm } from './UrlToPdfForm'

const SLOW_DEBOUNCE_TIME = 350
const FAST_DEBOUNCE_TIME = 50

/** Custom type — NativeTypes.HTML makes HTML5Backend treat the card as a native drag (dragleave can end it mid-flight). */
const PDF_CARD_DRAG_TYPE = 'libritus/pdf-card'

const inlineFieldClassName =
  'rounded-md bg-transparent caret-morphing-900 outline-none selection:bg-morphing-200 selection:text-morphing-900 focus-visible:ring-[3px] focus-visible:ring-morphing-200'

const pdfStatPillClassName =
  'flex h-5 items-center gap-1 rounded-full border border-morphing-300 bg-morphing-50/90 px-1.5 text-sm tabular-nums text-morphing-900 backdrop-blur-sm'

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
    <div className="flex w-56 flex-col gap-2">
      <ContextMenu>
        <ContextMenuTrigger ref={drag as unknown as React.Ref<HTMLDivElement>}>
          <Link
            to={`/category/${categoryId}/${pdf.id}`}
            aria-label={pdf.name}
            className="pdf-card-content relative flex h-80 w-56 items-center justify-center bg-morphing-100 p-0 [--radius:16px] outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-morphing-900 active:scale-[0.96]"
          >
            <div ref={preview as unknown as React.Ref<HTMLDivElement>} className="size-full">
              {pdf.thumbnail ? (
                <img src={pdf.thumbnail} alt="" className="size-full object-cover" />
              ) : (
                <span className="flex size-full items-center justify-center">
                  <DynamicIcon name="file-text" className="size-8 text-morphing-600" />
                </span>
              )}
            </div>
            <div className="pointer-events-none absolute inset-x-1.5 bottom-1.5 flex flex-wrap justify-end gap-1">
              {essaysNumber && essaysNumber > 0 ? (
                <p className={pdfStatPillClassName}>
                  <DynamicIcon name="file-pen-line" className="size-3 text-morphing-700" />
                  {essaysNumber}
                </p>
              ) : null}
              {notesNumber && notesNumber > 0 ? (
                <p className={pdfStatPillClassName}>
                  <DynamicIcon name="message-circle" className="size-3 text-morphing-700" />
                  {notesNumber}
                </p>
              ) : null}
              {searchesNumber && searchesNumber > 0 ? (
                <p className={pdfStatPillClassName}>
                  <DynamicIcon name="globe" className="size-3 text-morphing-700" />
                  {searchesNumber}
                </p>
              ) : null}
              {highlightsNumber && highlightsNumber > 0 ? (
                <p className={pdfStatPillClassName}>
                  <DynamicIcon name="highlighter" className="size-3 text-morphing-700" />
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
        aria-label={t('category_pdf_name_aria')}
        className={cn(
          inlineFieldClassName,
          'w-full cursor-text text-center text-sm text-morphing-800'
        )}
        defaultValue={pdf.name}
        title={pdf.name}
        autoComplete="off"
        onChange={(e) => {
          const name = e.target.value.trim()
          if (name) debouncedUpdateName(name)
        }}
        onBlur={(e) => {
          if (!e.target.value.trim()) e.target.value = pdf.name
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
  const [uploading, setUploading] = useState(false)

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
  const showDescription = !isDefault || Boolean(category.description)
  const pdfs = [...category.pdfs].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )

  return (
    <DragAndDropZone>
      <header className="mb-8 max-w-3xl pt-4">
        <h1 className="sr-only">{category.name}</h1>
        <div className="flex items-center gap-2">
          <div className="shrink-0 rounded-full has-focus-visible:ring-[3px] has-focus-visible:ring-morphing-200">
            <label
              className={cn(
                'block size-10 overflow-hidden rounded-full border border-morphing-600',
                isDefault ? 'cursor-default' : 'cursor-pointer'
              )}
            >
              <input
                key={`color-${categoryId}`}
                disabled={isDefault}
                readOnly={isDefault}
                type="color"
                name="color"
                aria-label={t('category_color_aria')}
                id={`color-${categoryId}`}
                className="size-full"
                defaultValue={category.color}
                onChange={(e) => {
                  updateColor(e.target.value)
                  fastUpdateColor(e.target.value)
                }}
              />
            </label>
          </div>
          {isDefault ? null : (
            <IconPicker
              className="size-8 shrink-0"
              aria-label={t('category_icon_aria')}
              defaultValue={category.icon}
              onValueChange={(icon) => updateCategory(categoryId, { icon })}
            >
              <DynamicIcon name={category.icon} size={24} />
            </IconPicker>
          )}
          <input
            key={`name-${categoryId}`}
            id={`name-${categoryId}`}
            aria-label={t('category_name_aria')}
            disabled={isDefault}
            readOnly={isDefault}
            autoComplete="off"
            className={cn(
              inlineFieldClassName,
              isDefault ? 'cursor-default' : 'cursor-text',
              'block min-w-40 flex-1 font-serif text-5xl font-semibold tracking-tighter text-morphing-900'
            )}
            defaultValue={category.name}
            onChange={(e) => {
              const name = e.target.value.trim()
              if (name) updateTitle(name)
            }}
            onBlur={(e) => {
              if (!e.target.value.trim()) e.target.value = category.name
            }}
          />
        </div>
        {showDescription ? (
          <textarea
            key={`description-${categoryId}`}
            id={`description-${categoryId}`}
            aria-label={t('category_description_aria')}
            disabled={isDefault}
            readOnly={isDefault}
            rows={1}
            placeholder={isDefault ? undefined : t('category_description_placeholder')}
            className={cn(
              inlineFieldClassName,
              isDefault ? 'cursor-default' : 'cursor-text',
              'mt-2 field-sizing-content max-h-40 min-h-7 w-full max-w-md resize-none overflow-y-auto text-lg text-morphing-700 placeholder:text-morphing-700'
            )}
            defaultValue={category.description}
            onChange={(e) => updateDescription(e.target.value)}
          />
        ) : null}
        <p className="mt-4 text-sm tabular-nums text-morphing-700">
          {category.pdfs.length === 0
            ? t('category_pdf_count_zero')
            : category.pdfs.length === 1
              ? t('category_pdf_count_one')
              : t('category_pdf_count', { count: category.pdfs.length })}
        </p>
      </header>
      <ul className="flex flex-wrap items-start gap-8">
        {pdfs.map((pdf) => (
          <li key={pdf.id}>
            <DraggablePdfCard pdf={pdf} categoryId={categoryId} />
          </li>
        ))}
        <li>
          <div
            className="flex h-80 w-56 flex-col overflow-hidden rounded-xl border border-morphing-300 bg-morphing-100"
            aria-busy={uploading}
          >
            <label
              htmlFor={`pdf-upload-${categoryId}`}
              className="relative flex flex-1 cursor-pointer flex-col items-center justify-center gap-2 p-4 text-center outline-none transition-colors duration-200 hover:bg-morphing-200/70 focus-within:ring-[3px] focus-within:ring-morphing-200 focus-within:ring-inset"
            >
              <DynamicIcon
                name={uploading ? 'loader-circle' : 'plus'}
                className={cn('size-10 text-morphing-600', uploading && 'animate-spin')}
              />
              <span className="text-lg font-medium text-morphing-800">
                {t('category_upload_pdf')}
              </span>
              <span className="text-sm text-morphing-800">
                {uploading ? t('category_uploading') : t('category_drop_hint')}
              </span>
              <input
                id={`pdf-upload-${categoryId}`}
                type="file"
                accept="application/pdf"
                className="absolute inset-0 cursor-pointer opacity-0 focus:outline-none"
                multiple
                disabled={uploading}
                onChange={async (e) => {
                  const files = [...(e.target.files || [])].filter(
                    (file) => file.type === 'application/pdf'
                  )
                  e.target.value = ''
                  if (files.length === 0) return
                  setUploading(true)
                  try {
                    for (const file of files) {
                      await uploadPdf(categoryId, file)
                    }
                  } finally {
                    setUploading(false)
                  }
                }}
              />
            </label>
            <div className="border-t border-morphing-300 p-2">
              <UrlToPdfForm categoryId={categoryId} />
            </div>
          </div>
        </li>
      </ul>
    </DragAndDropZone>
  )
}

export default Category
