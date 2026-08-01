// DISABLED: RAG/embeddings parked — see attachAiIpcListeners in ./index.ts.
// Keep this module for a future rewrite; main no longer imports it at runtime.

import type { FeatureExtractionPipeline } from '@huggingface/transformers'
import path from 'path'
import { APP_DATA_DIR } from '..'

export const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2'
export const EMBEDDING_DIMS = 384

const BATCH_SIZE = 8

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null
let modelReady = false

async function getExtractor(
  onStatus?: (status: 'downloading' | 'loading' | 'ready') => void
): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    onStatus?.('downloading')
    // Defer @huggingface/transformers until first embed — keeps cold start lean.
    extractorPromise = import('@huggingface/transformers').then(async ({ env, pipeline }) => {
      env.cacheDir = path.join(APP_DATA_DIR, 'models')
      env.allowLocalModels = true
      env.allowRemoteModels = true
      const p = await pipeline('feature-extraction', EMBEDDING_MODEL, {
        dtype: 'q8'
      })
      modelReady = true
      onStatus?.('ready')
      return p as FeatureExtractionPipeline
    })
  } else if (!modelReady) {
    onStatus?.('loading')
  } else {
    onStatus?.('ready')
  }
  return extractorPromise
}

function yieldMain(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

export type EmbedProgress = {
  done: number
  total: number
  status: 'downloading' | 'loading' | 'embedding' | 'ready'
}

/**
 * Embed texts with local MiniLM. Batches + setImmediate so main stays responsive.
 * // ponytail: singleton pipeline ~50–100MB; UtilityProcess if index freezes UI
 */
export async function embedTexts(
  texts: string[],
  onProgress?: (p: EmbedProgress) => void
): Promise<number[][]> {
  const extractor = await getExtractor((status) => {
    onProgress?.({ done: 0, total: texts.length, status })
  })

  const out: number[][] = []
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE)
    onProgress?.({
      done: i,
      total: texts.length,
      status: 'embedding'
    })
    const tensor = await extractor(batch, { pooling: 'mean', normalize: true })
    const list = tensor.tolist() as number[][]
    for (const row of list) out.push(row)
    await yieldMain()
  }
  onProgress?.({ done: texts.length, total: texts.length, status: 'ready' })
  return out
}

export async function ensureEmbeddingModel(
  onStatus?: (status: 'downloading' | 'loading' | 'ready') => void
): Promise<void> {
  await getExtractor(onStatus)
}
