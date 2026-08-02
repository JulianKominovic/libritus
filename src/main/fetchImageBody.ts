/** Read a fetch body with an early size cap (avoid OOM before checking length). */

export async function readBodyCapped(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
  contentLengthHeader: string | null
): Promise<Buffer | null> {
  if (contentLengthHeader) {
    const n = Number(contentLengthHeader)
    if (Number.isFinite(n) && (n <= 0 || n > maxBytes)) return null
  }
  if (!body) return null

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value?.byteLength) continue
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
  } catch {
    try {
      await reader.cancel()
    } catch {
      /* ignore */
    }
    return null
  }

  if (total === 0) return null
  return Buffer.concat(chunks.map((c) => Buffer.from(c)))
}
