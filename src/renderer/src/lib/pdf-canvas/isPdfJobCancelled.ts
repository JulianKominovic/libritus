import { PdfErrorCode } from '@embedpdf/models'

/** True when a pool render/text job was cancelled or the doc was destroyed. */
export function isPdfJobCancelled(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as {
    name?: string
    code?: number
    reason?: { code?: number }
  }
  if (e.name === 'AbortException') return true
  if (e.name === 'TaskAbortedError') return true
  if (e.code === PdfErrorCode.Cancelled) return true
  if (e.reason?.code === PdfErrorCode.Cancelled) return true
  return false
}
