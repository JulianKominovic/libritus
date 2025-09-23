/** biome-ignore-all lint/a11y/noStaticElementInteractions: <explanation> */

import { useMemo, useState } from 'react'
import { useDrop } from 'react-dnd'
import { NativeTypes } from 'react-dnd-html5-backend'
import { useDebounceCallback } from 'usehooks-ts'
import { useParams } from 'wouter'
import { cn } from '@/lib/utils'
import { usePdfs } from '@/stores/categories'

function DragAndDropZone({
  children,
  forceCategoryId,
  ...props
}: {
  children: React.ReactNode
  forceCategoryId?: string
} & React.HTMLAttributes<HTMLDivElement>) {
  const { categoryId } = useParams<{ categoryId: string | undefined }>()
  const safeCategoryId = forceCategoryId || categoryId || 'default'
  const uploadPdf = usePdfs((p) => p.uploadPdf)
  const [message, setMessage] = useState<
    'success' | 'error' | 'idle' | 'waiting-drop' | 'uploading'
  >('idle')
  const delayedSetMessage = useDebounceCallback(setMessage, 3000)

  const [, drop] = useDrop(
    () => ({
      accept: [NativeTypes.FILE],
      drop: async (item) => {
        const files = (item as { files: File[] }).files || []
        const filteredFiles = files.filter((file: File) => file.type === 'application/pdf')
        if (filteredFiles.length === 0) {
          setMessage('error')
          return delayedSetMessage('idle')
        }

        setMessage('uploading')

        for (const file of filteredFiles) {
          await uploadPdf(safeCategoryId, file)
        }
        setMessage('success')
        delayedSetMessage('idle')
      }
    }),
    []
  )

  const title = useMemo(() => {
    if (message === 'error') return 'One or more files are not PDFs'
    if (message === 'success') return 'Successfully uploaded'
    if (message === 'waiting-drop') return 'Waiting for drop'
    if (message === 'uploading') return 'Uploading...'
    return 'Drop the PDF here'
  }, [message])

  const description = useMemo(() => {
    if (message === 'error') return 'Those files will not be uploaded.'
    if (message === 'success') return 'All good!'
    if (message === 'waiting-drop') return 'Drop one or more PDFs here'
    if (message === 'uploading') return 'This may take a few seconds if the files are large'
    return 'Drop the PDF here'
  }, [message])

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
                'text-2xl font-bold mb-4 text-center font-serif',
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
