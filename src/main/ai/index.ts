import { BrowserWindow, ipcMain } from 'electron'
import { abortChat, streamChat, testOpenRouterConnection, type ChatMessage } from './chat'
import { EMBEDDING_DIMS, EMBEDDING_MODEL, embedTexts, ensureEmbeddingModel } from './embedder'
import {
  getRagIndexQueue,
  readRagMetaFile,
  type RagChunkInput,
  type RagQueueSnapshot
} from './ragIndex'
import {
  clearOpenRouterKey,
  hasOpenRouterKey,
  setOpenRouterKey
} from './secrets'

function broadcastRagQueue(snapshot: RagQueueSnapshot): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('ai:rag-queue', snapshot)
    }
  }
}

const ragQueue = getRagIndexQueue(broadcastRagQueue)

export function attachAiIpcListeners(): void {
  ipcMain.handle('ai:set-openrouter-key', async (_, { apiKey }: { apiKey: string }) => {
    await setOpenRouterKey(apiKey)
    return { ok: true as const }
  })

  ipcMain.handle('ai:has-openrouter-key', async () => {
    return hasOpenRouterKey()
  })

  ipcMain.handle('ai:clear-openrouter-key', async () => {
    await clearOpenRouterKey()
    return { ok: true as const }
  })

  ipcMain.handle('ai:test-openrouter', async () => {
    return testOpenRouterConnection()
  })

  ipcMain.handle('ai:embedding-info', () => {
    return { model: EMBEDDING_MODEL, dims: EMBEDDING_DIMS }
  })

  ipcMain.handle('ai:ensure-embedding-model', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    await ensureEmbeddingModel((status) => {
      win?.webContents.send('ai:embed-status', { status })
    })
    return { ok: true as const, model: EMBEDDING_MODEL, dims: EMBEDDING_DIMS }
  })

  ipcMain.handle(
    'ai:embed-texts',
    async (
      event,
      {
        texts,
        requestId
      }: {
        texts: string[]
        requestId: string
      }
    ) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      const vectors = await embedTexts(texts, (p) => {
        win?.webContents.send('ai:embed-progress', { requestId, ...p })
      })
      return { vectors }
    }
  )

  ipcMain.handle(
    'ai:rag-enqueue',
    async (
      _,
      {
        pdfId,
        fingerprint,
        chunks,
        title
      }: {
        pdfId: string
        fingerprint: string
        chunks: RagChunkInput[]
        title?: string
      }
    ) => {
      return ragQueue.enqueue({ pdfId, fingerprint, chunks, title })
    }
  )

  ipcMain.handle('ai:rag-cancel', async (_, { pdfId }: { pdfId: string }) => {
    ragQueue.cancel(pdfId)
    return { ok: true as const }
  })

  ipcMain.handle('ai:rag-snapshot', async () => {
    return ragQueue.getSnapshot()
  })

  ipcMain.handle('ai:rag-meta', async (_, { pdfId }: { pdfId: string }) => {
    return readRagMetaFile(pdfId)
  })

  ipcMain.handle(
    'ai:chat-stream',
    async (
      event,
      {
        requestId,
        model,
        messages
      }: {
        requestId: string
        model: string
        messages: ChatMessage[]
      }
    ) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return { ok: false as const, error: 'No window' }
      void streamChat({ requestId, model, messages, sender: win })
      return { ok: true as const }
    }
  )

  ipcMain.handle('ai:chat-abort', async (_, { requestId }: { requestId: string }) => {
    abortChat(requestId)
    return { ok: true as const }
  })
}
