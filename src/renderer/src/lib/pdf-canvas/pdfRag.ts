import type { OutlineNode } from './pdfOutline'
import type { PdfDocument } from './PdfDocument'
import { extractFromTextContent } from './pdfSearch'

export const RAG_VERSION = 1
export const EMBEDDING_MODEL_ID = 'Xenova/all-MiniLM-L6-v2'
export const EMBEDDING_DIMS = 384

/** ~chars per "token" for MiniLM-sized chunks (ponytail: not a real tokenizer). */
const CHARS_PER_TOKEN = 4
/** MiniLM practical context is small — keep chunks short. */
const TARGET_CHARS = 500 * CHARS_PER_TOKEN
const OVERLAP_CHARS = 40 * CHARS_PER_TOKEN

export type RagChunk = {
  id: string
  pageIndex: number
  chapterTitle?: string
  text: string
  embedding: number[]
}

export type RagIndex = {
  version: number
  pdfId: string
  fingerprint: string
  embeddingModel: string
  dims: number
  chunks: RagChunk[]
}

export type TextChunk = {
  id: string
  pageIndex: number
  chapterTitle?: string
  text: string
}

export type ChatHistoryMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: number[]
}

/** Simple fingerprint: pageCount + FNV-ish hash of page texts. */
export function fingerprintCorpus(pageTexts: string[]): string {
  let h = 2166136261 >>> 0
  const joined = `${pageTexts.length}|${pageTexts.map((t) => t.length).join(',')}|${pageTexts.join('\n')}`
  for (let i = 0; i < joined.length; i++) {
    h ^= joined.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `${pageTexts.length}:${(h >>> 0).toString(16)}`
}

type ChapterRange = { title: string; start: number; end: number }

/** Flatten outline into page ranges (end = next sibling start - 1, or pageCount-1). */
export function chapterRangesFromOutline(
  outline: OutlineNode[],
  pageCount: number
): ChapterRange[] {
  const flat: { title: string; start: number }[] = []
  function walk(nodes: OutlineNode[]): void {
    for (const n of nodes) {
      if (n.pageIndex != null) flat.push({ title: n.title, start: n.pageIndex })
      if (n.children.length) walk(n.children)
    }
  }
  walk(outline)
  flat.sort((a, b) => a.start - b.start)
  const ranges: ChapterRange[] = []
  for (let i = 0; i < flat.length; i++) {
    const start = flat[i].start
    const end = i + 1 < flat.length ? flat[i + 1].start - 1 : pageCount - 1
    ranges.push({ title: flat[i].title, start, end: Math.max(start, end) })
  }
  return ranges
}

export function chapterTitleForPage(
  ranges: ChapterRange[],
  pageIndex: number
): string | undefined {
  for (let i = ranges.length - 1; i >= 0; i--) {
    const r = ranges[i]
    if (pageIndex >= r.start && pageIndex <= r.end) return r.title
  }
  return undefined
}

/** Split long page text into overlapping windows. */
export function splitPageText(pageIndex: number, text: string, chapterTitle?: string): TextChunk[] {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (!cleaned) return []
  if (cleaned.length <= TARGET_CHARS) {
    return [
      {
        id: `p${pageIndex}-0`,
        pageIndex,
        chapterTitle,
        text: cleaned
      }
    ]
  }
  const chunks: TextChunk[] = []
  let start = 0
  let part = 0
  while (start < cleaned.length) {
    const end = Math.min(cleaned.length, start + TARGET_CHARS)
    const slice = cleaned.slice(start, end).trim()
    if (slice) {
      chunks.push({
        id: `p${pageIndex}-${part}`,
        pageIndex,
        chapterTitle,
        text: slice
      })
      part++
    }
    if (end >= cleaned.length) break
    start = end - OVERLAP_CHARS
    if (start < 0) start = 0
  }
  return chunks
}

export async function extractPageTexts(doc: PdfDocument): Promise<string[]> {
  const texts: string[] = []
  for (let i = 0; i < doc.pageCount; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const viewport = page.getViewport({ scale: 1 })
    const extracted = extractFromTextContent(content.items, viewport)
    texts.push(extracted.text)
  }
  return texts
}

export function buildTextChunks(
  pageTexts: string[],
  outline: OutlineNode[]
): { chunks: TextChunk[]; fingerprint: string } {
  const ranges = chapterRangesFromOutline(outline, pageTexts.length)
  const chunks: TextChunk[] = []
  for (let i = 0; i < pageTexts.length; i++) {
    const chapterTitle = chapterTitleForPage(ranges, i)
    chunks.push(...splitPageText(i, pageTexts[i], chapterTitle))
  }
  return { chunks, fingerprint: fingerprintCorpus(pageTexts) }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

export function topKChunks(index: RagIndex, queryEmbedding: number[], k = 8): RagChunk[] {
  const scored = index.chunks.map((c) => ({
    c,
    s: cosineSimilarity(queryEmbedding, c.embedding)
  }))
  scored.sort((a, b) => b.s - a.s)
  return scored.slice(0, k).map((x) => x.c)
}

export function formatRagContext(chunks: RagChunk[]): string {
  return chunks
    .map((c) => {
      const chap = c.chapterTitle ? ` (${c.chapterTitle})` : ''
      return `[p.${c.pageIndex + 1}]${chap}\n${c.text}`
    })
    .join('\n\n---\n\n')
}

export function parseRagIndex(raw: unknown): RagIndex | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (o.version !== RAG_VERSION) return null
  if (typeof o.pdfId !== 'string' || typeof o.fingerprint !== 'string') return null
  if (!Array.isArray(o.chunks)) return null
  return o as unknown as RagIndex
}

export const RAG_SYSTEM_PROMPT = `You are a reading assistant for the open PDF in Libritus.
Answer using only the provided context excerpts.
Cite pages as [p.N] where N is the 1-based page number from the context labels.
If the context is insufficient, say so clearly — do not invent page numbers or quotes.`
