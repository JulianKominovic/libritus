/** biome-ignore-all lint/a11y/noStaticElementInteractions: <explanation> */

import { downloadUrlAsPdf } from '@renderer/integrations/ipc'
import { useLang } from '@renderer/i18n/lang-context'
import { cn } from '@renderer/lib/utils'
import { usePdfs } from '@renderer/stores/categories'
import { useMemo, useState } from 'react'
import { useDrop } from 'react-dnd'
import { NativeTypes } from 'react-dnd-html5-backend'
import { useDebounceCallback } from 'usehooks-ts'
import { useParams } from 'wouter'

function DragAndDropZone({
  children,
  forceCategoryId,
  ...props
}: {
  children: React.ReactNode
  forceCategoryId?: string
} & React.HTMLAttributes<HTMLDivElement>) {
  const { categoryId } = useParams<{ categoryId: string | undefined }>()
  const categories = usePdfs((p) => p.categories)
  const safeCategoryId =
    forceCategoryId ||
    categoryId ||
    categories.find((c) => c.id === 'default')?.id ||
    categories[0]?.id ||
    'default'
  const uploadPdf = usePdfs((p) => p.uploadPdf)
  const { t } = useLang()
  const [message, setMessage] = useState<
    'success' | 'error' | 'idle' | 'waiting-drop' | 'uploading'
  >('idle')
  const delayedSetMessage = useDebounceCallback(setMessage, 2000)

  const [, drop] = useDrop(
    () => ({
      accept: [NativeTypes.FILE, NativeTypes.URL],
      drop: async (item) => {
        const files = (item as { files: File[] }).files || []
        const urls = (item as { urls: string[] }).urls || []
        const filteredFiles = files.filter((file: File) => file.type === 'application/pdf')
        if (filteredFiles.length === 0 && urls.length === 0) {
          setMessage('error')
          return delayedSetMessage('idle')
        }

        for (const url of urls) {
          const pdf = await downloadUrlAsPdf(url)
          if (pdf) {
            await uploadPdf(
              safeCategoryId,
              new File([pdf.buffer], `${url}.pdf`, {
                type: 'application/pdf',
                lastModified: new Date().getTime()
              }),
              {
                author: pdf.author || 'Unknown',
                name: pdf.title || 'Unknown',
                creationDate: pdf.publishedTime ? new Date(pdf.publishedTime) : null
              }
            )
          }
        }

        setMessage('uploading')

        for (const file of filteredFiles) {
          await uploadPdf(safeCategoryId, file)
        }
        setMessage('success')
        delayedSetMessage('idle')
      }
    }),
    [safeCategoryId, uploadPdf, delayedSetMessage]
  )

  const title = useMemo(() => {
    if (message === 'error') return t('drop_error_title')
    if (message === 'success') return t('drop_success_title')
    if (message === 'waiting-drop') return t('drop_waiting_title')
    if (message === 'uploading') return t('drop_uploading_title')
    return t('drop_idle_title')
  }, [message, t])

  const description = useMemo(() => {
    if (message === 'error') return t('drop_error_desc')
    if (message === 'success') return t('drop_success_desc')
    if (message === 'waiting-drop') return t('drop_waiting_desc')
    if (message === 'uploading') return t('drop_uploading_desc')
    return t('drop_idle_desc')
  }, [message, t])

  return (
    <div ref={drop as unknown as React.RefObject<HTMLDivElement>} {...props}>
      {children}
      <div
        className={cn(
          'fixed inset-0 bg-black/10 backdrop-blur-lg w-full h-full',
          message !== 'idle' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
      >
        <div className="flex items-center justify-center h-full">
          <div
            className={cn(
              'bg-white max-w-md w-full p-8 rounded-xl border',
              message === 'error' ? 'border-destructive/60' : 'border-morphing-200'
            )}
          >
            <h2
              className={cn(
                'text-2xl font-bold mb-4 text-center font-serif tracking-tighter',
                message === 'error' ? 'text-destructive' : 'text-morphing-800'
              )}
            >
              {title}
            </h2>
            <p
              className={cn(
                'text-muted-foreground text-center',
                message === 'error' ? 'text-destructive' : 'text-morphing-500'
              )}
            >
              {description}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DragAndDropZone
