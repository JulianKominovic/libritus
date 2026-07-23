import { describe, expect, test } from 'bun:test'
import {
  buildTextChunks,
  chapterRangesFromOutline,
  chapterTitleForPage,
  cosineSimilarity,
  fingerprintCorpus,
  formatRagContext,
  parseRagIndex,
  splitPageText,
  topKChunks,
  type RagChunk,
  type RagIndex
} from './pdfRag'

describe('splitPageText', () => {
  test('empty → []', () => {
    expect(splitPageText(0, '   ')).toEqual([])
  })

  test('short page → one chunk', () => {
    const c = splitPageText(2, 'Hello world', 'Intro')
    expect(c).toHaveLength(1)
    expect(c[0]).toMatchObject({ id: 'p2-0', pageIndex: 2, chapterTitle: 'Intro', text: 'Hello world' })
  })

  test('long page → multiple overlapping chunks', () => {
    const long = 'a'.repeat(3000)
    const c = splitPageText(0, long)
    expect(c.length).toBeGreaterThan(1)
    expect(c[0].id).toBe('p0-0')
    expect(c.every((x) => x.pageIndex === 0)).toBe(true)
  })
})

describe('outline chapter ranges', () => {
  test('assigns titles by page range', () => {
    const ranges = chapterRangesFromOutline(
      [
        { title: 'A', pageIndex: 0, children: [] },
        { title: 'B', pageIndex: 5, children: [] }
      ],
      10
    )
    expect(ranges).toEqual([
      { title: 'A', start: 0, end: 4 },
      { title: 'B', start: 5, end: 9 }
    ])
    expect(chapterTitleForPage(ranges, 3)).toBe('A')
    expect(chapterTitleForPage(ranges, 5)).toBe('B')
  })
})

describe('fingerprint + buildTextChunks', () => {
  test('fingerprint stable for same texts', () => {
    const a = fingerprintCorpus(['x', 'y'])
    const b = fingerprintCorpus(['x', 'y'])
    expect(a).toBe(b)
    expect(fingerprintCorpus(['x', 'z'])).not.toBe(a)
  })

  test('buildTextChunks tags chapters', () => {
    const { chunks, fingerprint } = buildTextChunks(
      ['page zero text', 'page one text'],
      [{ title: 'Ch1', pageIndex: 0, children: [] }]
    )
    expect(fingerprint).toBeTruthy()
    expect(chunks[0].chapterTitle).toBe('Ch1')
    expect(chunks[0].pageIndex).toBe(0)
  })
})

describe('cosine + topK', () => {
  test('identical vectors → 1', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1)
  })

  test('topK returns nearest', () => {
    const chunks: RagChunk[] = [
      { id: 'a', pageIndex: 0, text: 'a', embedding: [1, 0, 0] },
      { id: 'b', pageIndex: 1, text: 'b', embedding: [0, 1, 0] },
      { id: 'c', pageIndex: 2, text: 'c', embedding: [0.9, 0.1, 0] }
    ]
    const index: RagIndex = {
      version: 1,
      pdfId: 'x',
      fingerprint: 'f',
      embeddingModel: 'm',
      dims: 3,
      chunks
    }
    const top = topKChunks(index, [1, 0, 0], 2)
    expect(top.map((t) => t.id)).toEqual(['a', 'c'])
  })
})

describe('formatRagContext + parse', () => {
  test('format includes page labels', () => {
    const s = formatRagContext([
      { id: '1', pageIndex: 3, chapterTitle: 'X', text: 'hello', embedding: [] }
    ])
    expect(s).toContain('[p.4]')
    expect(s).toContain('hello')
  })

  test('parse rejects bad version', () => {
    expect(parseRagIndex({ version: 99, pdfId: 'a', fingerprint: 'f', chunks: [] })).toBeNull()
    expect(
      parseRagIndex({
        version: 1,
        pdfId: 'a',
        fingerprint: 'f',
        embeddingModel: 'm',
        dims: 384,
        chunks: []
      })
    ).not.toBeNull()
  })
})
