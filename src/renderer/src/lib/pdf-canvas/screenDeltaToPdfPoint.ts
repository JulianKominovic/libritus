/**
 * Map screen-space offset inside a page element (from getBoundingClientRect)
 * to PDF page space when an ancestor applies CSS `scale(zoom)`.
 *
 * EmbedPDF's default convertEventToPoint only divides by layout scale; Libritus
 * also zooms via CSS on the world div, so getBoundingClientRect includes zoom.
 */
export function screenDeltaToPdfPoint(
  dx: number,
  dy: number,
  zoom: number,
  scale: number
): { x: number; y: number } {
  const denom = zoom * scale
  if (denom === 0) return { x: 0, y: 0 }
  return { x: dx / denom, y: dy / denom }
}
