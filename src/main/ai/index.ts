import { BrowserWindow, ipcMain } from 'electron'
import { abortChat, streamChat, testOpenRouterConnection, type ChatMessage } from './chat'
import { clearOpenRouterKey, hasOpenRouterKey, setOpenRouterKey } from './secrets'

// ---------------------------------------------------------------------------
// RAG / local embeddings — DISABLED
//
// Parked until we redo this properly (not the current MiniLM + serial queue
// + Chat-sidebar silo). Modules still live under src/main/ai/ (embedder.ts,
// ragIndex.ts, ragIndexQueue.ts) for a future rewrite. Do not re-enable by
// uncommenting alone: product north wants canvas artifacts, not auto-index
// on every PDF open.
//
// To revive later: restore imports + real handlers below; wire enqueue from
// PdfCanvasApp only behind an explicit user action (not open-by-default).
// ---------------------------------------------------------------------------
// import { EMBEDDING_DIMS, EMBEDDING_MODEL, embedTexts, ensureEmbeddingModel } from './embedder'
// import {
//   getRagIndexQueue,
//   readRagMetaFile,
//   type RagChunkInput,
//   type RagQueueSnapshot
// } from './ragIndex'
//
// function broadcastRagQueue(snapshot: RagQueueSnapshot): void {
//   for (const win of BrowserWindow.getAllWindows()) {
//     if (!win.isDestroyed()) {
//       win.webContents.send('ai:rag-queue', snapshot)
//     }
//   }
// }
//
// const ragQueue = getRagIndexQueue(broadcastRagQueue)

/** Idle snapshot so renderer indicators / cancel calls stay quiet while RAG is off. */
const RAG_DISABLED_SNAPSHOT = {
  active: null,
  pending: [] as { pdfId: string; title?: string }[],
  lastFinished: null
}

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

  // --- RAG / embeddings stubs (feature off) ---
  ipcMain.handle('ai:embedding-info', () => {
    return { model: null, dims: 0, disabled: true as const }
  })

  ipcMain.handle('ai:ensure-embedding-model', async () => {
    return { ok: false as const, disabled: true as const, error: 'RAG/embeddings disabled' }
  })

  ipcMain.handle('ai:embed-texts', async () => {
    return { vectors: [] as number[][], disabled: true as const }
  })

  ipcMain.handle('ai:rag-enqueue', async () => {
    return { ok: true as const, skipped: 'disabled' as const }
  })

  ipcMain.handle('ai:rag-cancel', async () => {
    return { ok: true as const }
  })

  ipcMain.handle('ai:rag-snapshot', async () => {
    return RAG_DISABLED_SNAPSHOT
  })

  ipcMain.handle('ai:rag-meta', async () => {
    return null
  })

  // --- Real RAG / embeddings handlers (restore when redoing the feature) ---
  // ipcMain.handle('ai:embedding-info', () => {
  //   return { model: EMBEDDING_MODEL, dims: EMBEDDING_DIMS }
  // })
  //
  // ipcMain.handle('ai:ensure-embedding-model', async (event) => {
  //   const win = BrowserWindow.fromWebContents(event.sender)
  //   await ensureEmbeddingModel((status) => {
  //     win?.webContents.send('ai:embed-status', { status })
  //   })
  //   return { ok: true as const, model: EMBEDDING_MODEL, dims: EMBEDDING_DIMS }
  // })
  //
  // ipcMain.handle(
  //   'ai:embed-texts',
  //   async (
  //     event,
  //     {
  //       texts,
  //       requestId
  //     }: {
  //       texts: string[]
  //       requestId: string
  //     }
  //   ) => {
  //     const win = BrowserWindow.fromWebContents(event.sender)
  //     const vectors = await embedTexts(texts, (p) => {
  //       win?.webContents.send('ai:embed-progress', { requestId, ...p })
  //     })
  //     return { vectors }
  //   }
  // )
  //
  // ipcMain.handle(
  //   'ai:rag-enqueue',
  //   async (
  //     _,
  //     {
  //       pdfId,
  //       fingerprint,
  //       chunks,
  //       title
  //     }: {
  //       pdfId: string
  //       fingerprint: string
  //       chunks: RagChunkInput[]
  //       title?: string
  //     }
  //   ) => {
  //     return ragQueue.enqueue({ pdfId, fingerprint, chunks, title })
  //   }
  // )
  //
  // ipcMain.handle('ai:rag-cancel', async (_, { pdfId }: { pdfId: string }) => {
  //   ragQueue.cancel(pdfId)
  //   return { ok: true as const }
  // })
  //
  // ipcMain.handle('ai:rag-snapshot', async () => {
  //   return ragQueue.getSnapshot()
  // })
  //
  // ipcMain.handle('ai:rag-meta', async (_, { pdfId }: { pdfId: string }) => {
  //   return readRagMetaFile(pdfId)
  // })

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
