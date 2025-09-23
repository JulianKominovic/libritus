import chroma from 'chroma-js'
import { DynamicIcon } from 'lucide-react/dynamic'
import { useLayoutEffect } from 'react'
import { useDrag } from 'react-dnd'
import { NativeTypes } from 'react-dnd-html5-backend'
import { useDebounceCallback } from 'usehooks-ts'
import { Link, Redirect, useParams } from 'wouter'
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu'
import { IconPicker } from '@/components/ui/icon-picker'
import { setGlobalTheme } from '@/lib/app-theme'
import { createColorPalette } from '@/lib/colors'
import { cn } from '@/lib/utils'
import PdfCardContextMenuContent from '@/organisms/pdf/pdf-card-context-menu-content'
import { type Pdf, usePdfs } from '@/stores/categories'
import DragAndDropZone from '@/templates/drag-and-drop'

const DEBOUNCE_TIME = 300

function DraggablePdfCard({ pdf, categoryId }: { pdf: Pdf; categoryId: string }) {
  const [, drag, preview] = useDrag(() => ({
    type: NativeTypes.HTML,
    previewOptions: {
      offsetX: -1,
      offsetY: 320
    },
    options: { dropEffect: 'move' },
    item: { id: pdf.id, type: 'P' }
  }))

  return (
    <ContextMenu key={pdf.id}>
      <ContextMenuTrigger ref={drag as unknown as React.Ref<HTMLDivElement>} asChild>
        <Link
          to={`/category/${categoryId}/${pdf.id}`}
          className={
            'p-0 flex flex-col justify-center items-center h-80 w-56 object-contain bg-morphing-100 relative group pdf-card-content [--radius:16px] hover:scale-105 duration-300 transition-transform group'
          }
        >
          <img
            ref={preview as unknown as React.Ref<HTMLImageElement>}
            src={pdf.thumbnail || ''}
            alt={pdf.name}
            className={'size-full object-cover'}
          />
          <div className="bg-black/20 border border-black/5 backdrop-blur-3xl absolute bottom-1.5 right-1.5 w-fit rounded-full">
            <p className="text-white px-2">
              {pdf.progress.percentage > 0 ? (
                `${pdf.progress.percentage.toFixed(0)}%`
              ) : (
                <i className="font-serif">New</i>
              )}
            </p>
          </div>
        </Link>
      </ContextMenuTrigger>
      <PdfCardContextMenuContent pdf={pdf} categoryId={categoryId} />
    </ContextMenu>
  )
}

function Category() {
  const { categoryId } = useParams()

  const categories = usePdfs((p) => p.categories)
  const updateCategory = usePdfs((p) => p.updateCategory)
  const updateTitle = useDebounceCallback((title: string) => {
    updateCategory(categoryId || '', {
      name: title
    })
  }, DEBOUNCE_TIME)
  const updateDescription = useDebounceCallback((description: string) => {
    updateCategory(categoryId || '', { description })
  }, DEBOUNCE_TIME)
  const updateColor = useDebounceCallback((color: string) => {
    const hex = chroma(color).hex()
    updateCategory(categoryId || '', { color: hex })
    const palette = createColorPalette(hex)
    console.log(palette)
  }, DEBOUNCE_TIME)
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
            'cursor-pointer size-8 rounded-[50%] overflow-hidden aspect-square border-morphing-600 border transition-transform flex-shrink-0',
            isDefault ? '' : 'hover:scale-110'
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
            onChange={(e) => updateColor(e.target.value)}
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
      <h2 className="text-sm text- mb-6">{category.pdfs.length} pdfs</h2>
      <div className="flex flex-wrap gap-8 group/container">
        {category.pdfs.map((pdf) => (
          <DraggablePdfCard key={`${pdf.id}card`} pdf={pdf} categoryId={categoryId} />
        ))}
        <label
          htmlFor={`pdf-upload-${categoryId}`}
          className="border-morphing-200 p-4 flex flex-col justify-center items-center rounded-xl border h-80 w-52 bg-morphing-100 hover:bg-morphing-200 transition-colors"
        >
          <DynamicIcon name="plus" className="size-10 text-morphing-600" />
          <p className="text-morphing-800 text-lg font-medium">Upload a PDF</p>
          <p className="text-sm text-morphing-800">or drop it here</p>
          <input
            id={`pdf-upload-${categoryId}`}
            type="file"
            placeholder="Upload a PDF"
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
      </div>
    </DragAndDropZone>
  )
}

export default Category
