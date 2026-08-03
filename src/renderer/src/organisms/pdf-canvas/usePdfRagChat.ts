import {
  abortChatStream,
  embedTexts,
  getRagMeta,
  getRagQueueSnapshot,
  hasOpenRouterKey,
  onChatChunk,
  onChatDone,
  onChatError,
  onRagQueue,
  startChatStream,
  type RagQueueSnapshot
} from '@renderer/lib/ai/ipc'
import {
  formatRagContext,
  RAG_SYSTEM_PROMPT,
  topKChunks,
  type ChatHistoryMessage,
  type RagIndex
} from '@renderer/lib/pdf-canvas/pdfRag'
import {
  readChatHistory,
  readRagIndex,
  writeChatHistory
} from '@renderer/lib/pdf-canvas/pdfRagPersist'
import { useSettings } from '@renderer/stores/settings'
import { useCallback, useEffect, useRef, useState } from 'react'

export type IndexStatus =
  | { kind: 'idle' }
  | { kind: 'queued' }
  | { kind: 'indexing'; done: number; total: number; phase: 'downloading_model' | 'embedding' }
  | { kind: 'ready'; chunkCount: number }
  | { kind: 'empty' }
  | { kind: 'error'; message: string }

export type UsePdfRagChatArgs = {
  pdfId: string
  active: boolean
}

function newId(): string {
  return crypto.randomUUID()
}

function statusFromQueue(pdfId: string, snap: RagQueueSnapshot): IndexStatus {
  if (snap.active?.pdfId === pdfId) {
    return {
      kind: 'indexing',
      done: snap.active.done,
      total: snap.active.total,
      phase: snap.active.phase
    }
  }
  if (snap.pending.some((p) => p.pdfId === pdfId)) {
    return { kind: 'queued' }
  }
  if (snap.lastFinished?.pdfId === pdfId) {
    return snap.lastFinished.chunkCount === 0
      ? { kind: 'empty' }
      : { kind: 'ready', chunkCount: snap.lastFinished.chunkCount }
  }
  return { kind: 'idle' }
}

export function usePdfRagChat({ pdfId, active }: UsePdfRagChatArgs) {
  const chatModel = useSettings((s) => s.openRouterChatModel)
  const [messages, setMessages] = useState<ChatHistoryMessage[]>([])
  const [indexStatus, setIndexStatus] = useState<IndexStatus>({ kind: 'idle' })
  const [hasKey, setHasKey] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const indexRef = useRef<RagIndex | null>(null)
  const streamReqRef = useRef<string | null>(null)
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  useEffect(() => {
    void hasOpenRouterKey().then(setHasKey)
  }, [active])

  useEffect(() => {
    let cancelled = false
    void readChatHistory(pdfId).then((m) => {
      if (!cancelled) setMessages(m)
    })
    return () => {
      cancelled = true
    }
  }, [pdfId])

  // Queue + lightweight meta for status. Full rag.json only on send (avoids OOM).
  useEffect(() => {
    let cancelled = false
    indexRef.current = null
    setIndexStatus({ kind: 'idle' })

    void (async () => {
      const snap = await getRagQueueSnapshot()
      if (cancelled) return
      const fromQueue = statusFromQueue(pdfId, snap)
      if (fromQueue.kind !== 'idle') {
        setIndexStatus(fromQueue)
        return
      }
      const meta = await getRagMeta(pdfId)
      if (cancelled) return
      if (meta && meta.chunkCount > 0) {
        setIndexStatus({ kind: 'ready', chunkCount: meta.chunkCount })
      } else if (meta) {
        setIndexStatus({ kind: 'empty' })
      } else {
        setIndexStatus({ kind: 'idle' })
      }
    })()

    const unsub = onRagQueue((snap) => {
      if (cancelled) return
      const next = statusFromQueue(pdfId, snap)
      if (next.kind === 'idle') return
      setIndexStatus(next)
      if (snap.lastFinished?.pdfId === pdfId) {
        indexRef.current = null
      }
    })

    return () => {
      cancelled = true
      unsub()
    }
  }, [pdfId])

  const persistMessages = useCallback(
    (next: ChatHistoryMessage[]) => {
      setMessages(next)
      void writeChatHistory(pdfId, next)
    },
    [pdfId]
  )

  useEffect(() => {
    return () => {
      const req = streamReqRef.current
      if (req) void abortChatStream(req)
    }
  }, [pdfId])

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || streaming) return

      const keyOk = await hasOpenRouterKey()
      setHasKey(keyOk)
      if (!keyOk) {
        setError('Add an OpenRouter API key in Settings to chat.')
        return
      }

      let index = indexRef.current
      if (!index) {
        index = await readRagIndex(pdfId)
        indexRef.current = index
      }
      if (!index || index.chunks.length === 0) {
        setError('No searchable text in this PDF.')
        return
      }

      setError(null)
      const userMsg: ChatHistoryMessage = { id: newId(), role: 'user', content: trimmed }
      const assistantId = newId()
      const prior = messagesRef.current
      const withUser = [
        ...prior,
        userMsg,
        { id: assistantId, role: 'assistant' as const, content: '' }
      ]
      setMessages(withUser)

      let queryVec: number[]
      try {
        const { vectors } = await embedTexts([trimmed], newId())
        queryVec = vectors[0] ?? []
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setMessages(prior)
        return
      }

      const hits = topKChunks(index, queryVec, 8)
      const citations = [...new Set(hits.map((h) => h.pageIndex))]
      const context = formatRagContext(hits)

      const requestId = newId()
      streamReqRef.current = requestId
      setStreaming(true)

      let assembled = ''
      const finish = (errMsg?: string) => {
        setStreaming(false)
        streamReqRef.current = null
        unsubChunk()
        unsubDone()
        unsubErr()
        if (errMsg) setError(errMsg)
        setMessages((prev) => {
          const updated = prev.map((m) =>
            m.id === assistantId ? { ...m, content: assembled, citations } : m
          )
          void writeChatHistory(pdfId, updated)
          return updated
        })
      }

      const unsubChunk = onChatChunk((p) => {
        if (p.requestId !== requestId) return
        assembled += p.text
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: assembled, citations } : m))
        )
      })
      const unsubDone = onChatDone((p) => {
        if (p.requestId !== requestId) return
        finish()
      })
      const unsubErr = onChatError((p) => {
        if (p.requestId !== requestId) return
        finish(p.error)
      })

      const history = prior.slice(-6).map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }))

      const result = await startChatStream({
        requestId,
        model: chatModel,
        messages: [
          { role: 'system', content: RAG_SYSTEM_PROMPT },
          ...history,
          {
            role: 'user',
            content: `Context from the PDF:\n\n${context}\n\n---\n\nQuestion: ${trimmed}`
          }
        ]
      })

      if (!result.ok) {
        finish('error' in result ? result.error : 'Failed to start chat')
      }
    },
    [chatModel, pdfId, streaming]
  )

  const clearChat = useCallback(() => {
    persistMessages([])
  }, [persistMessages])

  return {
    messages,
    indexStatus,
    hasKey,
    streaming,
    error,
    send,
    clearChat,
    refreshKey: () => void hasOpenRouterKey().then(setHasKey)
  }
}
