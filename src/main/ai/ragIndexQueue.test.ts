import { expect, test } from 'bun:test'
import {
  createRagIndexQueue,
  type RagChunkInput,
  type RagMeta,
  type RagQueueSnapshot
} from './ragIndexQueue'

const MODEL = 'test-model'

function chunk(id: string, text = 'hello'): RagChunkInput {
  return { id, pageIndex: 0, text }
}

function makeQueue(overrides?: {
  embed?: (
    texts: string[],
    onProgress?: (p: { done: number; total: number; status: string }) => void
  ) => Promise<number[][]>
}) {
  const metas = new Map<string, RagMeta>()
  const files = new Map<string, unknown>()
  let last: RagQueueSnapshot = { active: null, pending: [], lastFinished: null }
  let embedCalls = 0
  const queue = createRagIndexQueue({
    embeddingModel: MODEL,
    embeddingDims: 3,
    readMeta: async (pdfId) => metas.get(pdfId) ?? null,
    writeIndex: async (pdfId, index) => {
      files.set(pdfId, index)
      metas.set(pdfId, {
        version: index.version,
        fingerprint: index.fingerprint,
        embeddingModel: index.embeddingModel,
        chunkCount: index.chunks.length
      })
    },
    ensureModel: async () => {},
    embed:
      overrides?.embed ??
      (async (texts, onProgress) => {
        embedCalls++
        onProgress?.({ done: 0, total: texts.length, status: 'embedding' })
        onProgress?.({ done: texts.length, total: texts.length, status: 'ready' })
        return texts.map(() => [0.1, 0.2, 0.3])
      }),
    onSnapshot: (s) => {
      last = structuredClone(s)
    }
  })
  return {
    queue,
    files,
    metas,
    getLast: () => last,
    getEmbedCalls: () => embedCalls
  }
}

test('empty chunks writes empty index and skips embed', async () => {
  const { queue, files, getEmbedCalls, getLast } = makeQueue()
  const r = await queue.enqueue({ pdfId: 'empty', fingerprint: 'fp0', chunks: [] })
  expect(r.skipped).toBe('disk')
  expect(getEmbedCalls()).toBe(0)
  expect(files.get('empty')).toMatchObject({ chunks: [], fingerprint: 'fp0' })
  expect(getLast().lastFinished).toEqual({ pdfId: 'empty', chunkCount: 0 })
})

test('disk hit skips embed', async () => {
  const { queue, metas, getEmbedCalls, getLast } = makeQueue()
  metas.set('a', {
    version: 1,
    fingerprint: 'fp1',
    embeddingModel: MODEL,
    chunkCount: 1
  })
  const r = await queue.enqueue({
    pdfId: 'a',
    fingerprint: 'fp1',
    chunks: [chunk('c0')]
  })
  expect(r.skipped).toBe('disk')
  expect(getEmbedCalls()).toBe(0)
  expect(getLast().lastFinished).toEqual({ pdfId: 'a', chunkCount: 1 })
})

test('second enqueue same fingerprint is duplicate while active', async () => {
  let resolveEmbed!: () => void
  const blocked = new Promise<void>((r) => {
    resolveEmbed = r
  })
  const { queue, files } = makeQueue({
    embed: async (texts, onProgress) => {
      onProgress?.({ done: 0, total: texts.length, status: 'embedding' })
      await blocked
      return texts.map(() => [0.1])
    }
  })

  const p1 = queue.enqueue({ pdfId: 'a', fingerprint: 'fp', chunks: [chunk('1')] })
  await Promise.resolve()
  await Promise.resolve()
  const r2 = await queue.enqueue({ pdfId: 'a', fingerprint: 'fp', chunks: [chunk('1')] })
  expect(r2.skipped).toBe('duplicate')
  resolveEmbed()
  await p1
  await new Promise((r) => setTimeout(r, 5))
  expect(files.has('a')).toBe(true)
})

test('different pdf goes pending while first embeds', async () => {
  let resolveEmbed!: () => void
  const blocked = new Promise<void>((r) => {
    resolveEmbed = r
  })
  const { queue, files, getLast } = makeQueue({
    embed: async (texts, onProgress) => {
      onProgress?.({ done: 0, total: texts.length, status: 'embedding' })
      await blocked
      return texts.map(() => [0.1])
    }
  })

  void queue.enqueue({ pdfId: 'a', fingerprint: 'fpA', chunks: [chunk('1')], title: 'A' })
  await Promise.resolve()
  await Promise.resolve()
  expect(getLast().active?.pdfId).toBe('a')

  void queue.enqueue({ pdfId: 'b', fingerprint: 'fpB', chunks: [chunk('2')], title: 'B' })
  await Promise.resolve()
  expect(getLast().pending.map((p) => p.pdfId)).toEqual(['b'])

  resolveEmbed()
  await new Promise((r) => setTimeout(r, 20))
  expect(files.has('a')).toBe(true)
  expect(files.has('b')).toBe(true)
  expect(getLast().active).toBeNull()
  expect(getLast().pending).toEqual([])
  expect(getLast().lastFinished?.pdfId).toBe('b')
})

test('cancel removes pending and abandons active write', async () => {
  let resolveEmbed!: () => void
  const blocked = new Promise<void>((r) => {
    resolveEmbed = r
  })
  const { queue, files, getLast } = makeQueue({
    embed: async (texts) => {
      await blocked
      return texts.map(() => [0.1])
    }
  })

  void queue.enqueue({ pdfId: 'a', fingerprint: 'fp', chunks: [chunk('1')] })
  await Promise.resolve()
  await Promise.resolve()
  void queue.enqueue({ pdfId: 'b', fingerprint: 'fp', chunks: [chunk('2')] })
  await Promise.resolve()
  queue.cancel('b')
  expect(getLast().pending).toEqual([])
  queue.cancel('a')
  resolveEmbed()
  await new Promise((r) => setTimeout(r, 10))
  expect(files.has('a')).toBe(false)
})
