'use client'

import { useChat as useBaseChat } from '@ai-sdk/react'
import { usePluginOption } from 'platejs/react'
import * as React from 'react'

import { aiChatPlugin } from '@renderer/components/editor/plugins/ai-kit'

export const useChat = () => {
  const options = usePluginOption(aiChatPlugin, 'chatOptions')

  // remove when you implement the route /api/ai/command
  const abortControllerRef = React.useRef<AbortController | null>(null)
  const _abortFakeStream = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
  }

  const chat = useBaseChat({
    id: 'editor',
    // Mock the API response. Remove it when you implement the route /api/ai/command
    fetch: async () => {
      return new Response()
      // const res = await fetch(input, init)

      // if (!res.ok) {
      //   let sample: 'markdown' | 'mdx' | null = null

      //   try {
      //     const content = JSON.parse(init?.body as string).messages.at(-1).content

      //     if (content.includes('Generate a markdown sample')) {
      //       sample = 'markdown'
      //     } else if (content.includes('Generate a mdx sample')) {
      //       sample = 'mdx'
      //     }
      //   } catch {
      //     sample = null
      //   }

      //   abortControllerRef.current = new AbortController()
      //   await new Promise((resolve) => setTimeout(resolve, 400))

      //   return new Response(stream, {
      //     headers: {
      //       Connection: 'keep-alive',
      //       'Content-Type': 'text/plain'
      //     }
      //   })
      // }

      // return res
    },
    ...options
  })

  return { ...chat, _abortFakeStream }
}
