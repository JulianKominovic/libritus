/** Thin IPC wrappers for OpenRouter BYOK + local embeddings (main process). */

export async function setOpenRouterKey(apiKey: string): Promise<void> {
  await window.electron.ipcRenderer.invoke('ai:set-openrouter-key', { apiKey })
}

export async function hasOpenRouterKey(): Promise<boolean> {
  return window.electron.ipcRenderer.invoke('ai:has-openrouter-key')
}

export async function clearOpenRouterKey(): Promise<void> {
  await window.electron.ipcRenderer.invoke('ai:clear-openrouter-key')
}

export async function testOpenRouter(): Promise<{ ok: true } | { ok: false; error: string }> {
  return window.electron.ipcRenderer.invoke('ai:test-openrouter')
}

export async function ensureEmbeddingModel(): Promise<{
  ok: true
  model: string
  dims: number
}> {
  return window.electron.ipcRenderer.invoke('ai:ensure-embedding-model')
}

export async function embedTexts(
  texts: string[],
  requestId: string
): Promise<{ vectors: number[][] }> {
  return window.electron.ipcRenderer.invoke('ai:embed-texts', { texts, requestId })
}

export type ChatIpcMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export async function startChatStream(opts: {
  requestId: string
  model: string
  messages: ChatIpcMessage[]
}): Promise<{ ok: true } | { ok: false; error: string }> {
  return window.electron.ipcRenderer.invoke('ai:chat-stream', opts)
}

export async function abortChatStream(requestId: string): Promise<void> {
  await window.electron.ipcRenderer.invoke('ai:chat-abort', { requestId })
}

export function onChatChunk(
  handler: (payload: { requestId: string; text: string }) => void
): () => void {
  return window.electron.ipcRenderer.on('ai:chat-chunk', (_e, payload) => handler(payload))
}

export function onChatDone(handler: (payload: { requestId: string }) => void): () => void {
  return window.electron.ipcRenderer.on('ai:chat-done', (_e, payload) => handler(payload))
}

export function onChatError(
  handler: (payload: { requestId: string; error: string }) => void
): () => void {
  return window.electron.ipcRenderer.on('ai:chat-error', (_e, payload) => handler(payload))
}

export function onEmbedProgress(
  handler: (payload: {
    requestId: string
    done: number
    total: number
    status: string
  }) => void
): () => void {
  return window.electron.ipcRenderer.on('ai:embed-progress', (_e, payload) => handler(payload))
}

export function onEmbedStatus(
  handler: (payload: { status: string }) => void
): () => void {
  return window.electron.ipcRenderer.on('ai:embed-status', (_e, payload) => handler(payload))
}

export type RagChunkInput = {
  id: string
  pageIndex: number
  chapterTitle?: string
  text: string
}

export type RagQueueActive = {
  pdfId: string
  title?: string
  fingerprint: string
  phase: 'downloading_model' | 'embedding'
  done: number
  total: number
}

export type RagQueuePending = {
  pdfId: string
  title?: string
}

export type RagQueueSnapshot = {
  active: RagQueueActive | null
  pending: RagQueuePending[]
  lastFinished: { pdfId: string; chunkCount: number } | null
}

export async function enqueueRagIndex(args: {
  pdfId: string
  fingerprint: string
  chunks: RagChunkInput[]
  title?: string
}): Promise<{ ok: true; skipped?: 'disk' | 'duplicate' }> {
  return window.electron.ipcRenderer.invoke('ai:rag-enqueue', args)
}

export async function cancelRagIndex(pdfId: string): Promise<void> {
  await window.electron.ipcRenderer.invoke('ai:rag-cancel', { pdfId })
}

export async function getRagQueueSnapshot(): Promise<RagQueueSnapshot> {
  return window.electron.ipcRenderer.invoke('ai:rag-snapshot')
}

export type RagMeta = {
  version: number
  fingerprint: string
  embeddingModel: string
  chunkCount: number
}

export async function getRagMeta(pdfId: string): Promise<RagMeta | null> {
  return window.electron.ipcRenderer.invoke('ai:rag-meta', { pdfId })
}

export function onRagQueue(handler: (snapshot: RagQueueSnapshot) => void): () => void {
  return window.electron.ipcRenderer.on('ai:rag-queue', (_e, payload) => handler(payload))
}
