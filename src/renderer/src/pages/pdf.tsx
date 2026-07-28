import { PdfCanvasApp } from '@renderer/organisms/pdf-canvas/PdfCanvasApp'
import { PdfCanvasErrorBoundary } from '@renderer/organisms/pdf-canvas/PdfCanvasErrorBoundary'
import { Redirect, useParams } from 'wouter'

export default function PdfPage() {
  const { categoryId, pdfId } = useParams<{ categoryId: string; pdfId: string }>()

  if (!categoryId || !pdfId) {
    return <Redirect to="/" />
  }

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden">
      <PdfCanvasErrorBoundary key={`${categoryId}:${pdfId}`}>
        <PdfCanvasApp categoryId={categoryId} pdfId={pdfId} />
      </PdfCanvasErrorBoundary>
    </div>
  )
}
