import { describe, expect, test } from 'bun:test'
import { readBodyCapped } from './fetchImageBody'

function streamFromChunks(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let i = 0
  return new ReadableStream({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close()
        return
      }
      controller.enqueue(chunks[i]!)
      i++
    }
  })
}

describe('readBodyCapped', () => {
  test('rejects oversized Content-Length before reading', async () => {
    const body = streamFromChunks([new Uint8Array([1, 2, 3])])
    expect(await readBodyCapped(body, 2, '100')).toBeNull()
  })

  test('rejects zero or negative Content-Length', async () => {
    expect(await readBodyCapped(streamFromChunks([new Uint8Array([1])]), 10, '0')).toBeNull()
  })

  test('aborts when streamed bytes exceed max', async () => {
    const body = streamFromChunks([new Uint8Array([1, 2]), new Uint8Array([3, 4, 5])])
    expect(await readBodyCapped(body, 4, null)).toBeNull()
  })

  test('returns buffer when under max', async () => {
    const body = streamFromChunks([new Uint8Array([1, 2]), new Uint8Array([3])])
    const buf = await readBodyCapped(body, 10, '3')
    expect(buf).not.toBeNull()
    expect([...buf!]).toEqual([1, 2, 3])
  })

  test('null body / empty stream → null', async () => {
    expect(await readBodyCapped(null, 10, null)).toBeNull()
    expect(await readBodyCapped(streamFromChunks([]), 10, null)).toBeNull()
  })
})
