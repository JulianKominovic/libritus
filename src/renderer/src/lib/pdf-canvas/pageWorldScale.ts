import type { PageSize } from './types'
import type { SessionCamera } from './sessionTypes'

/** US Letter width in PDF points — canonical world page width at zoom 1. */
export const REFERENCE_PAGE_WIDTH = 612

export type PageWorldScale = {
  scale: number
  sizes: PageSize[]
}

/**
 * Scale native pdf.js page sizes so the widest page matches REFERENCE_PAGE_WIDTH.
 * Keeps aspect ratios; scale ≈ 1 for Letter/A4.
 */
export function pageWorldScale(
  pageSizes: PageSize[],
  referenceWidth = REFERENCE_PAGE_WIDTH
): PageWorldScale {
  if (pageSizes.length === 0) {
    return { scale: 1, sizes: [] }
  }
  let maxW = 0
  for (const p of pageSizes) {
    if (p.width > maxW) maxW = p.width
  }
  if (maxW <= 0) {
    return { scale: 1, sizes: pageSizes.map((p) => ({ ...p })) }
  }
  const scale = referenceWidth / maxW
  return {
    scale,
    sizes: pageSizes.map((p) => ({
      width: p.width * scale,
      height: p.height * scale
    }))
  }
}

/** Scale absolute scene geometry; Excalidraw `points` stay relative to x/y. */
export function scaleSessionScene(
  elements: unknown[],
  camera: SessionCamera,
  scale: number
): { elements: unknown[]; camera: SessionCamera } {
  if (scale === 1) {
    return { elements, camera }
  }
  return {
    camera: {
      scrollX: camera.scrollX * scale,
      scrollY: camera.scrollY * scale,
      zoom: camera.zoom
    },
    elements: elements.map((el) => scaleSceneElement(el, scale))
  }
}

function scaleSceneElement(el: unknown, scale: number): unknown {
  if (!el || typeof el !== 'object') return el
  const e = el as Record<string, unknown>
  const out: Record<string, unknown> = { ...e }
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    if (typeof out[key] === 'number') {
      out[key] = (out[key] as number) * scale
    }
  }
  return out
}
