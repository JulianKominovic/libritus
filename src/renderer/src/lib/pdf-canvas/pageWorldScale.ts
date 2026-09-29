import type { PageSize } from './types'
import type { SessionCamera } from './sessionTypes'

/** US Letter width in PDF points — canonical world page width at zoom 1. */
export const REFERENCE_PAGE_WIDTH = 612

/** Fallback density when the caller does not pass a screen-aware target. */
export const TARGET_WORLD_DENSITY = 2

/** Canvas zoom where bitmaps are 1:1 with device pixels (150%). */
export const READING_ZOOM = 1.5

/**
 * Bitmap pixels per world CSS px so a page is sharp at READING_ZOOM.
 * Retina (dpr 2) → 3. Below that zoom the bitmap is downscaled; above it, stretched.
 */
export function readingDensity(devicePixelRatio = 1): number {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1
  return READING_ZOOM * dpr
}

/** Render scale bounds relative to native page points. */
const MIN_RENDER_SCALE = 1
/** Covers ~250pt pages at reading density 3 (612/250 * 3 ≈ 7.3). */
const MAX_RENDER_SCALE = 8

/**
 * Render scale so bitmaps stay ~targetDensity in world CSS space.
 * Letter worldScale=1, density 2 → 2; small pages raise scale; huge pages lower it (clamped).
 */
export function renderScaleForWorld(
  worldScale: number,
  targetDensity = TARGET_WORLD_DENSITY
): number {
  const raw = targetDensity * worldScale
  if (raw < MIN_RENDER_SCALE) return MIN_RENDER_SCALE
  if (raw > MAX_RENDER_SCALE) return MAX_RENDER_SCALE
  return raw
}

export type PageWorldScale = {
  scale: number
  sizes: PageSize[]
}

/**
 * Scale native PDF page sizes so the widest page matches REFERENCE_PAGE_WIDTH.
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
