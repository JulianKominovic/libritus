'use client'

import { useChat as useBaseChat } from '@ai-sdk/react'
import { AIChatPlugin } from '@platejs/ai/react'
import { DefaultChatTransport } from 'ai'
import { useEditorRef } from 'platejs/react'
import * as React from 'react'

export const useChat = () => {
  const editor = useEditorRef()
  // chatOptions is a custom option attached via AIChatPlugin.extend
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const options = (editor.getOptions(AIChatPlugin) as any).chatOptions as
    | { api?: string; body?: Record<string, unknown> }
    | undefined

  // remove when you implement the route /api/ai/command
  const abortControllerRef = React.useRef<AbortController | null>(null)
  const _abortFakeStream = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
  }

  const transport = React.useMemo(
    () =>
      new DefaultChatTransport({
        api: options?.api || '/api/ai/command',
        // Mock the API response. Remove it when you implement the route /api/ai/command
        fetch: (async () => new Response()) as unknown as typeof fetch
      }),
    [options?.api]
  )

  const chat = useBaseChat({
    id: 'editor',
    transport
  })

  React.useEffect(() => {
    editor.setOption(AIChatPlugin, 'chat', { ...chat, _abortFakeStream } as never)
  }, [chat, editor])

  return { ...chat, _abortFakeStream }
}
