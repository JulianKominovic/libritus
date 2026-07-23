import { OpenRouter } from '@openrouter/sdk'
import { BrowserWindow } from 'electron'
import { readOpenRouterKey } from './secrets'

type StreamChunk = {
  choices?: Array<{ delta?: { content?: string | null } }>
}

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

const APP_REFERER = 'https://github.com/JulianKominovic/libritus'
const APP_TITLE = 'Libritus'

const activeAborts = new Map<string, AbortController>()

function clientForKey(apiKey: string): OpenRouter {
  return new OpenRouter({
    apiKey,
    httpReferer: APP_REFERER,
    appTitle: APP_TITLE
  })
}

export async function testOpenRouterConnection(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const key = await readOpenRouterKey()
  if (!key) return { ok: false, error: 'No API key configured' }
  try {
    const client = clientForKey(key)
    // Cheap authenticated call
    const page = await client.models.list()
    // Drain one page to confirm auth works
    void page
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function streamChat(opts: {
  requestId: string
  model: string
  messages: ChatMessage[]
  sender: BrowserWindow
}): Promise<void> {
  const key = await readOpenRouterKey()
  if (!key) {
    opts.sender.webContents.send('ai:chat-error', {
      requestId: opts.requestId,
      error: 'No API key configured'
    })
    return
  }

  const prev = activeAborts.get(opts.requestId)
  prev?.abort()
  const ac = new AbortController()
  activeAborts.set(opts.requestId, ac)

  try {
    const client = clientForKey(key)
    const stream = await client.chat.send({
      chatRequest: {
        model: opts.model,
        messages: opts.messages.map((m) => ({
          role: m.role,
          content: m.content
        })),
        stream: true
      }
    })

    for await (const chunk of stream as AsyncIterable<StreamChunk>) {
      if (ac.signal.aborted) break
      const text = chunk.choices?.[0]?.delta?.content ?? ''
      if (text) {
        opts.sender.webContents.send('ai:chat-chunk', {
          requestId: opts.requestId,
          text
        })
      }
    }

    if (!ac.signal.aborted) {
      opts.sender.webContents.send('ai:chat-done', { requestId: opts.requestId })
    }
  } catch (err) {
    if (ac.signal.aborted) return
    opts.sender.webContents.send('ai:chat-error', {
      requestId: opts.requestId,
      error: err instanceof Error ? err.message : String(err)
    })
  } finally {
    activeAborts.delete(opts.requestId)
  }
}

export function abortChat(requestId: string): void {
  const ac = activeAborts.get(requestId)
  ac?.abort()
  activeAborts.delete(requestId)
}
