import { ChatContainerContent, ChatContainerRoot } from '@renderer/components/ui/chat-container'
import { Message, MessageContent } from '@renderer/components/ui/message'
import {
  PromptInput,
  PromptInputActions,
  PromptInputTextarea
} from '@renderer/components/ui/prompt-input'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { useEffect, useState } from 'react'
import { usePdfRagChat, type IndexStatus } from './usePdfRagChat'

export type PdfChatPanelProps = {
  pdfId: string
  active: boolean
  onGoToPage: (pageIndex0: number) => void
}

function indexLabel(status: IndexStatus): string {
  switch (status.kind) {
    case 'idle':
      return 'Waiting for index…'
    case 'queued':
      return 'Queued for indexing…'
    case 'indexing':
      return status.phase === 'downloading_model'
        ? 'Downloading model…'
        : `Indexing ${status.done}/${status.total}…`
    case 'ready':
      return `Ready · ${status.chunkCount} chunks`
    case 'empty':
      return 'No extractable text'
    case 'error':
      return status.message
  }
}

export function PdfChatPanel({ pdfId, active, onGoToPage }: PdfChatPanelProps) {
  const { messages, indexStatus, hasKey, streaming, error, send, clearChat, refreshKey } =
    usePdfRagChat({ pdfId, active })
  const [draft, setDraft] = useState('')

  useEffect(() => {
    if (active) refreshKey()
  }, [active, refreshKey])

  const ready = indexStatus.kind === 'ready'
  const canSend = ready && hasKey && !streaming && draft.trim().length > 0

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-1.5 border-b border-morphing-200 px-2.5 py-2">
        <p className="text-[10px] uppercase tracking-wide text-morphing-500">Index</p>
        <p
          className={cn(
            'text-xs tabular-nums text-pretty',
            indexStatus.kind === 'error' || indexStatus.kind === 'empty'
              ? 'text-destructive'
              : 'text-morphing-700'
          )}
        >
          {indexLabel(indexStatus)}
        </p>
        {!hasKey ? (
          <p className="text-xs text-pretty text-morphing-500">
            Add an OpenRouter key in Settings to send messages. Indexing runs in the background.
          </p>
        ) : null}
        {error ? <p className="text-xs text-pretty text-destructive">{error}</p> : null}
      </div>

      <ChatContainerRoot className="min-h-0 flex-1 px-2">
        <ChatContainerContent className="gap-3 py-3">
          {messages.length === 0 ? (
            <p className="px-1 text-xs text-pretty text-morphing-400">
              Ask about this PDF. Answers cite pages like [p.12].
            </p>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  'animate-in fade-in-0 slide-in-from-bottom-1 duration-150',
                  m.role === 'user' ? 'items-end' : 'items-start'
                )}
              >
                <Message className={m.role === 'user' ? 'flex-row-reverse' : undefined}>
                  <MessageContent
                    markdown={m.role === 'assistant'}
                    className={cn(
                      'max-w-[95%] text-xs',
                      m.role === 'user'
                        ? 'bg-morphing-900 text-morphing-50'
                        : 'bg-morphing-50 text-morphing-900'
                    )}
                  >
                    {m.content || (streaming && m.role === 'assistant' ? '…' : '')}
                  </MessageContent>
                </Message>
                {m.role === 'assistant' && m.citations && m.citations.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1 px-1">
                    {m.citations.map((pageIndex0) => (
                      <button
                        key={pageIndex0}
                        type="button"
                        className="min-h-8 rounded-md px-2 text-[10px] tabular-nums text-morphing-700 ring-1 ring-morphing-300 transition-transform duration-150 ease-out active:scale-[0.96] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-morphing-50"
                        onClick={() => onGoToPage(pageIndex0)}
                      >
                        p.{pageIndex0 + 1}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </ChatContainerContent>
      </ChatContainerRoot>

      <div className="shrink-0 border-t border-morphing-200 p-2">
        {messages.length > 0 ? (
          <button
            type="button"
            className="mb-1.5 text-[10px] text-morphing-500 underline-offset-2 [@media(hover:hover)_and_(pointer:fine)]:hover:underline"
            onClick={clearChat}
          >
            Clear chat
          </button>
        ) : null}
        <PromptInput
          value={draft}
          onValueChange={setDraft}
          isLoading={streaming}
          onSubmit={() => {
            if (!canSend) return
            const t = draft
            setDraft('')
            void send(t)
          }}
          className="rounded-xl border-morphing-300 bg-white shadow-none"
        >
          <PromptInputTextarea
            placeholder={hasKey ? 'Ask about this PDF…' : 'Configure API key in Settings…'}
            disabled={!hasKey || !ready || streaming}
            className="min-h-10 text-xs"
          />
          <PromptInputActions className="justify-end p-1">
            <Button
              type="button"
              size="sm"
              disabled={!canSend}
              onClick={() => {
                if (!canSend) return
                const t = draft
                setDraft('')
                void send(t)
              }}
            >
              Send
            </Button>
          </PromptInputActions>
        </PromptInput>
      </div>
    </div>
  )
}
