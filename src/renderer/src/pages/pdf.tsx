import { PdfCanvasApp } from '@renderer/organisms/pdf-canvas/PdfCanvasApp'
import { useCallback } from 'react'
import { Redirect, useLocation, useParams } from 'wouter'

export default function PdfPage() {
  const { categoryId, pdfId } = useParams<{ categoryId: string; pdfId: string }>()
  const [, setLocation] = useLocation()

  const onBack = useCallback(() => {
    setLocation(categoryId ? `/category/${categoryId}` : '/')
  }, [categoryId, setLocation])

  if (!categoryId || !pdfId) {
    return <Redirect to="/" />
  }

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden">
      <PdfCanvasApp pdfId={pdfId} onBack={onBack} />
    </div>
  )
}
