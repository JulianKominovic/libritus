/** Registered by PdfCanvasApp while a PDF session is open. */
let flushFn: (() => Promise<void>) | null = null

export function setActiveSessionFlush(fn: (() => Promise<void>) | null): void {
  flushFn = fn
}

export async function flushActiveSession(): Promise<void> {
  if (flushFn) await flushFn()
}
