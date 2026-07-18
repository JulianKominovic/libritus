/** Registered by PdfCanvasApp while a PDF session is open. page is 1-based. */
let jumpFn: ((page1Based: number) => void) | null = null

export function setActivePageJump(fn: ((page1Based: number) => void) | null): void {
  jumpFn = fn
}

export function jumpToActivePdfPage(page1Based: number): void {
  jumpFn?.(page1Based)
}
