import chroma from 'chroma-js'
import { getPdfEngine } from '@renderer/lib/pdf-canvas/embedpdfEngine'
import { getPaletteFromImageData } from './color-thief'

export async function getPdfMetadata(file: File): Promise<{
  title: string
  author: string
  creationDate: Date | null
  modificationDate: Date | null
  pages: number
  creator: string
  producer: string
  thumbnail: Blob | null
  hexColor: string
}> {
  const engine = await getPdfEngine()
  const pdfData = await file.arrayBuffer()
  const doc = await engine
    .openDocumentBuffer({
      id: crypto.randomUUID(),
      content: pdfData
    })
    .toPromise()

  try {
    const meta = await engine.getMetadata(doc).toPromise()
    const title = meta.title || file.name.replace(/\.[^/.]+$/, '')
    const author = meta.author || ''
    const creator = meta.creator || ''
    const producer = meta.producer || ''
    const pages = doc.pageCount
    const creationDate = meta.creationDate
    const modificationDate = meta.modificationDate

    const canvas = document.createElement('canvas')
    const canvasContext = canvas.getContext('2d')!
    const firstPage = doc.pages[0]
    let thumbnail: Blob | null = null
    let hexColor = '#212121'

    if (firstPage) {
      const image = await engine
        .renderPageRaw(doc, firstPage, { scaleFactor: 1, dpr: 1 })
        .toPromise()
      canvas.width = image.width
      canvas.height = image.height
      const pixels =
        image.data instanceof Uint8ClampedArray
          ? image.data
          : new Uint8ClampedArray(image.data as ArrayBuffer)
      canvasContext.putImageData(new ImageData(pixels, image.width, image.height), 0, 0)
      thumbnail = await new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob))
      })
      const dominantColor = getPaletteFromImageData(
        canvasContext.getImageData(0, 0, canvas.width, canvas.height)
      )
      const [r, g, b] = dominantColor || [33, 33, 33]
      hexColor = chroma(r, g, b).hex()
    }

    return {
      title,
      author,
      creationDate,
      modificationDate,
      pages,
      creator,
      producer,
      thumbnail,
      hexColor
    }
  } finally {
    try {
      await engine.closeDocument(doc).toPromise()
    } catch {
      /* ignore */
    }
  }
}
