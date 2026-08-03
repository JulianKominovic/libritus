import { readFile, writeFile } from '@renderer/integrations/fs'
import { parseRagIndex, type ChatHistoryMessage, type RagIndex } from './pdfRag'

function ragFilename(pdfId: string): string {
  return `${pdfId}.rag.json`
}

function chatFilename(pdfId: string): string {
  return `${pdfId}.chat.json`
}

export async function readRagIndex(pdfId: string): Promise<RagIndex | null> {
  const bytes = await readFile(ragFilename(pdfId))
  if (!bytes) return null
  try {
    return parseRagIndex(JSON.parse(new TextDecoder().decode(bytes)) as unknown)
  } catch {
    return null
  }
}

export async function writeRagIndex(pdfId: string, index: RagIndex): Promise<void> {
  const json = JSON.stringify(index)
  await writeFile(ragFilename(pdfId), new TextEncoder().encode(json))
}

export async function readChatHistory(pdfId: string): Promise<ChatHistoryMessage[]> {
  const bytes = await readFile(chatFilename(pdfId))
  if (!bytes) return []
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as {
      messages?: ChatHistoryMessage[]
    }
    return Array.isArray(parsed.messages) ? parsed.messages : []
  } catch {
    return []
  }
}

export async function writeChatHistory(
  pdfId: string,
  messages: ChatHistoryMessage[]
): Promise<void> {
  const json = JSON.stringify({ version: 1, messages })
  await writeFile(chatFilename(pdfId), new TextEncoder().encode(json))
}
