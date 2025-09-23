import type { HighlightRect } from '@anaralabs/lector'
import type { IconName } from 'lucide-react/dynamic'
import { create } from 'zustand'
import { readFile, writeFile } from '@/integrations/fs'
import { getPdfMetadata } from '@/lib/pdf'

export enum HighlightColorEnum {
  Fuchsia = 0,
  Lime = 1,
  Cyan = 2
}

export type Pdf = {
  id: string
  name: string
  filename: string
  src: string
  size: number
  createdAt: string
  updatedAt: string
  pages: number
  thumbnail: string
  author: string
  hexColor: string
  /**
   * The date the PDF was created
   */
  creationDate: Date | null
  /**
   * The date the PDF was last modified
   */
  modificationDate: Date | null
  progress: {
    /**
     * 0-100
     */
    percentage: number
    pages: number
    offset: number
  }
  zoom?: number
  isZoomFitWidth?: boolean
  highlights?: {
    id: string
    createdAt: string | Date
    updatedAt: string | Date
    color: HighlightColorEnum
    text: string
    rects: HighlightRect[]
    comments?: {
      id: string
      createdAt: string | Date
      updatedAt: string | Date
      text: string
    }[]
  }[]
}
export type Category = {
  id: string
  name: string
  description: string
  createdAt: string
  updatedAt: string
  icon: IconName
  // HEX COLOR
  color: string
  pdfs: Pdf[]
}

export type PdfsStore = {
  categories: Category[]
  createCategory: () => Promise<Category>
  setCategories: (categories: PdfsStore['categories']) => Promise<void>
  load: () => Promise<void>
  uploadPdf: (categoryId: string, data: File) => Promise<Pdf>
  updatePdf: (categoryId: string, pdfId: string, pdf: Partial<Pdf>) => Promise<void>
  deletePdf: (categoryId: string, pdfId: string) => Promise<void>
  movePdf: (pdfId: string, destinationCategoryId: string) => Promise<void>
  updateCategory: (categoryId: string, category: Partial<Category>) => Promise<void>
  deleteCategory: (categoryId: string) => Promise<void>
  addHighlightToPdf: (
    categoryId: string,
    pdfId: string,
    highlight: NonNullable<Pdf['highlights']>[0]
  ) => Promise<void>
  removeHighlightFromPdf: (categoryId: string, pdfId: string, highlightId: string) => Promise<void>
  updateHighlight: (
    categoryId: string,
    pdfId: string,
    highlightId: string,
    highlight: Partial<NonNullable<Pdf['highlights']>[0]>
  ) => Promise<void>
  addCommentToHighlight: (
    categoryId: string,
    pdfId: string,
    highlightId: string,
    comment: NonNullable<NonNullable<Pdf['highlights']>[0]['comments']>[0]
  ) => Promise<void>
  deleteCommentFromHighlight: (
    categoryId: string,
    pdfId: string,
    highlightId: string,
    commentId: string
  ) => Promise<void>
}

export const usePdfs = create<PdfsStore>((set, get) => ({
  categories: [],
  createCategory: async () => {
    const id = crypto.randomUUID()
    const category: Category = {
      id,
      name: 'New Category',
      description: 'New Category',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      icon: 'badge-help',
      color: '#f0aa46',
      pdfs: []
    }
    await get().setCategories([...get().categories, category])
    return category
  },
  load: async () => {
    const categories = await readFile('categories.json')
    console.log(categories)
    if (categories) {
      try {
        const parsedFile = JSON.parse(new TextDecoder().decode(categories))
        console.log('Loaded categories', parsedFile)
        set({ categories: parsedFile })
      } catch (err) {
        console.log('Error loading categories', err)
      }
    } else {
      get().setCategories([
        {
          name: 'Uncategorized',
          description:
            'PDFs will be automatically added to this category if they are not added to any other category.',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          id: 'default',
          icon: 'circle-dot',
          color: '#555',
          pdfs: []
        }
      ])
    }
  },

  setCategories: async (categories) => {
    await writeFile('categories.json', new TextEncoder().encode(JSON.stringify(categories)))
    set({ categories })
  },
  movePdf: async (pdfId: string, destinationCategoryId: string) => {
    let sourceCategory: Category | undefined
    let destinationCategory: Category | undefined
    let pdf: Pdf | undefined
    const categories = [...get().categories]
    for (const category of categories) {
      if (sourceCategory && destinationCategory && pdf) break
      const pdfFound = category.pdfs.find((p) => p.id === pdfId)
      if (pdfFound) {
        sourceCategory = category
        pdf = pdfFound
      }
      if (category.id === destinationCategoryId) {
        destinationCategory = category
      }
    }

    if (sourceCategory && destinationCategory && pdf) {
      sourceCategory.pdfs = sourceCategory.pdfs.filter((p) => p.id !== pdfId)
      destinationCategory.pdfs = [...destinationCategory.pdfs, pdf]
      await get().setCategories(categories)
    }
  },
  uploadPdf: async (categoryId = 'default', data: File) => {
    if (data.type !== 'application/pdf') throw new Error('Invalid file type')
    const id = crypto.randomUUID()
    const pdfMetadata = await getPdfMetadata(data)
    const thumbnailSrc = await writeFile(
      `${id}.png`,
      new Uint8Array((await pdfMetadata.thumbnail?.arrayBuffer()) || new ArrayBuffer(0))
    )
    const pdfSrc = await writeFile(`${id}.pdf`, new Uint8Array(await data.arrayBuffer()))
    const pdf: Pdf = {
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      name: pdfMetadata.title,
      filename: data.name,
      src: pdfSrc,
      size: data.size,
      pages: pdfMetadata.pages,
      thumbnail: thumbnailSrc,
      author: pdfMetadata.author || pdfMetadata.creator || pdfMetadata.producer,
      creationDate: pdfMetadata.creationDate,
      modificationDate: pdfMetadata.modificationDate,
      progress: { percentage: 0, pages: 0, offset: 0 },
      hexColor: pdfMetadata.hexColor || '#555555',
      highlights: []
    }
    const categories = [...get().categories].map((cat) => {
      if (cat.id === categoryId) {
        return {
          ...cat,
          pdfs: [...cat.pdfs, pdf]
        }
      }
      return cat
    })
    await get().setCategories(categories)
    return pdf
  },
  updatePdf: async (categoryId: string, pdfId: string, pdf: Partial<Pdf>) => {
    const categories = [...get().categories].map((cat) => {
      if (cat.id === categoryId) {
        return {
          ...cat,
          pdfs: cat.pdfs.map((p) => (p.id === pdfId ? { ...p, ...pdf } : p))
        }
      }
      return cat
    })
    await get().setCategories(categories)
  },
  deletePdf: async (categoryId: string, pdfId: string) => {
    const categories = [...get().categories].map((cat) => {
      if (cat.id === categoryId) {
        return { ...cat, pdfs: cat.pdfs.filter((p) => p.id !== pdfId) }
      }
      return cat
    })
    await get().setCategories(categories)
  },
  updateCategory: async (categoryId = 'default', category: Partial<Category>) => {
    const categories = [...get().categories].map((cat) => {
      if (cat.id === categoryId) {
        return {
          ...cat,
          ...category
        }
      }
      return cat
    })

    await get().setCategories(categories)
  },
  deleteCategory: async (categoryId: string) => {
    if (categoryId === 'default') return
    const categories = [...get().categories].filter((cat) => cat.id !== categoryId)
    await get().setCategories(categories)
  },
  addHighlightToPdf: async (
    categoryId: string,
    pdfId: string,
    highlight: NonNullable<Pdf['highlights']>[0]
  ) => {
    const categories = [...get().categories].map((cat) => {
      if (cat.id === categoryId) {
        return {
          ...cat,
          pdfs: cat.pdfs.map((pdf) => {
            if (pdf.id === pdfId) {
              return {
                ...pdf,
                highlights: [...(pdf.highlights || []), highlight]
              }
            }
            return pdf
          })
        }
      }
      return cat
    })
    await get().setCategories(categories)
  },
  removeHighlightFromPdf: async (categoryId: string, pdfId: string, highlightId: string) => {
    const categories = [...get().categories].map((cat) => {
      if (cat.id === categoryId) {
        return {
          ...cat,
          pdfs: cat.pdfs.map((pdf) => {
            if (pdf.id === pdfId) {
              return {
                ...pdf,
                highlights: pdf.highlights?.filter((h) => h.id !== highlightId)
              }
            }
            return pdf
          })
        }
      }
      return cat
    })
    await get().setCategories(categories)
  },
  updateHighlight: async (
    categoryId: string,
    pdfId: string,
    highlightId: string,
    highlight: Partial<NonNullable<Pdf['highlights']>[0]>
  ) => {
    const categories = [...get().categories].map((cat) => {
      if (cat.id === categoryId) {
        return {
          ...cat,
          pdfs: cat.pdfs.map((pdf) => {
            if (pdf.id === pdfId) {
              return {
                ...pdf,
                highlights: (pdf.highlights || []).map((h) =>
                  h.id === highlightId ? { ...h, ...highlight } : h
                )
              }
            }
            return pdf
          })
        }
      }
      return cat
    })
    await get().setCategories(categories)
  },
  addCommentToHighlight: async (
    categoryId: string,
    pdfId: string,
    highlightId: string,
    comment: NonNullable<NonNullable<Pdf['highlights']>[0]['comments']>[0]
  ) => {
    const categories = [...get().categories].map((cat) => {
      if (cat.id === categoryId) {
        return {
          ...cat,
          pdfs: cat.pdfs.map((pdf) => {
            if (pdf.id === pdfId) {
              return {
                ...pdf,
                highlights: pdf.highlights?.map((h) =>
                  h.id === highlightId ? { ...h, comments: [...(h.comments || []), comment] } : h
                )
              }
            }
            return pdf
          })
        }
      }
      return cat
    })
    await get().setCategories(categories)
  },
  deleteCommentFromHighlight: async (
    categoryId: string,
    pdfId: string,
    highlightId: string,
    commentId: string
  ) => {
    const categories = [...get().categories].map((cat) => {
      if (cat.id === categoryId) {
        return {
          ...cat,
          pdfs: cat.pdfs.map((pdf) => {
            if (pdf.id === pdfId) {
              return {
                ...pdf,
                highlights: pdf.highlights?.map((h) =>
                  h.id === highlightId
                    ? {
                        ...h,
                        comments: h.comments?.filter((c) => c.id !== commentId)
                      }
                    : h
                )
              }
            }
            return pdf
          })
        }
      }
      return cat
    })
    await get().setCategories(categories)
  }
}))

await usePdfs.getState().load()
