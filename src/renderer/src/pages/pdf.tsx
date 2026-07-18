import { PdfCanvasApp } from '@renderer/organisms/pdf-canvas/PdfCanvasApp'
import { Redirect, useParams } from 'wouter'

export default function PdfPage() {
  const { categoryId, pdfId } = useParams<{ categoryId: string; pdfId: string }>()

  if (!categoryId || !pdfId) {
    return <Redirect to="/" />
  }

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden">
      <PdfCanvasApp pdfId={pdfId} />
    </div>
  )
}
