// DISABLED: RAG/embeddings parked — see attachAiIpcListeners in ./index.ts.
// Keep this module for a future rewrite; main no longer imports it at runtime.

import fs from 'fs/promises'
import path from 'path'
import { APP_DATA_DIR } from '..'
import { EMBEDDING_DIMS, EMBEDDING_MODEL, embedTexts, ensureEmbeddingModel } from './embedder'
import {
  createRagIndexQueue,
  RAG_VERSION,
  type RagMeta,
  type RagQueueSnapshot,
  type StoredRagIndex
} from './ragIndexQueue'

export {
  createRagIndexQueue,
  RAG_VERSION,
  type RagChunkInput,
  type RagEnqueueArgs,
  type RagMeta,
  type RagQueueActive,
  type RagQueuePending,
  type RagQueueSnapshot,
  type StoredRagIndex
} from './ragIndexQueue'

function ragPath(pdfId: string): string {
  return path.join(APP_DATA_DIR, `${pdfId}.rag.json`)
}

function ragMetaPath(pdfId: string): string {
  return path.join(APP_DATA_DIR, `${pdfId}.rag.meta.json`)
}

export async function readRagMetaFile(pdfId: string): Promise<RagMeta | null> {
  try {
    const raw = await fs.readFile(ragMetaPath(pdfId), 'utf8')
    const parsed = JSON.parse(raw) as RagMeta
    if (parsed?.version !== RAG_VERSION || typeof parsed.fingerprint !== 'string') return null
    if (typeof parsed.chunkCount !== 'number') return null
    return parsed
  } catch {
    // Fallback: legacy rag.json without sidecar — peek fingerprint only via full read once.
    try {
      const raw = await fs.readFile(ragPath(pdfId), 'utf8')
      const parsed = JSON.parse(raw) as StoredRagIndex
      if (parsed?.version !== RAG_VERSION || !Array.isArray(parsed.chunks)) return null
      const meta: RagMeta = {
        version: parsed.version,
        fingerprint: parsed.fingerprint,
        embeddingModel: parsed.embeddingModel,
        chunkCount: parsed.chunks.length
      }
      // Write sidecar so next open stays cheap.
      void fs.writeFile(ragMetaPath(pdfId), JSON.stringify(meta)).catch(() => {})
      return meta
    } catch {
      return null
    }
  }
}

export async function writeRagIndexFile(pdfId: string, index: StoredRagIndex): Promise<void> {
  const meta: RagMeta = {
    version: index.version,
    fingerprint: index.fingerprint,
    embeddingModel: index.embeddingModel,
    chunkCount: index.chunks.length
  }
  await Promise.all([
    fs.writeFile(ragPath(pdfId), JSON.stringify(index)),
    fs.writeFile(ragMetaPath(pdfId), JSON.stringify(meta))
  ])
}

let defaultQueue: ReturnType<typeof createRagIndexQueue> | null = null
let snapshotListener: ((snapshot: RagQueueSnapshot) => void) | null = null

export function getRagIndexQueue(
  onSnapshot: (snapshot: RagQueueSnapshot) => void
): ReturnType<typeof createRagIndexQueue> {
  snapshotListener = onSnapshot
  if (!defaultQueue) {
    defaultQueue = createRagIndexQueue({
      readMeta: readRagMetaFile,
      writeIndex: writeRagIndexFile,
      embed: embedTexts,
      ensureModel: ensureEmbeddingModel,
      onSnapshot: (s) => snapshotListener?.(s),
      embeddingModel: EMBEDDING_MODEL,
      embeddingDims: EMBEDDING_DIMS
    })
  }
  return defaultQueue
}

/** Test helper — reset singleton between tests. */
export function __resetRagIndexQueueForTests(): void {
  defaultQueue = null
  snapshotListener = null
}
