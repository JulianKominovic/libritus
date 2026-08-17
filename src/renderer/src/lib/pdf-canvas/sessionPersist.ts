export type PersistCamera = {
  scrollX: number
  scrollY: number
  zoom: number
}

export type DirtyGateInput = {
  sig: string
  lastSaved: string
  pending: string
  dirty: boolean
}

export type DirtyGateResult =
  { action: 'clear' } | { action: 'noop' } | { action: 'dirty'; pending: string }

const roundCam = (n: number) => Math.round(n * 1000) / 1000

/**
 * Excalidraw bumps these on every newElementWith / scene touch.
 * Including them in the dirty signature retriggers markUnsaved on every
 * onChange and permanently resets the autosave debounce.
 */
function stabilizeElement(el: unknown): unknown {
  if (!el || typeof el !== 'object') return el
  const { version: _v, versionNonce: _vn, updated: _u, ...rest } = el as Record<string, unknown>
  return rest
}

/** Stable signature of elements + camera for dirty detection. */
export function persistSignature(elements: readonly unknown[], camera: PersistCamera): string {
  return JSON.stringify({
    elements: elements.map(stabilizeElement),
    camera: {
      scrollX: roundCam(camera.scrollX),
      scrollY: roundCam(camera.scrollY),
      zoom: roundCam(camera.zoom)
    }
  })
}

/** Elements-only stable signature (cheap split from the camera part). */
export function persistElementsSignature(elements: readonly unknown[]): string {
  return JSON.stringify(elements.map(stabilizeElement))
}

/** Camera-only stable signature (cheap — no scene traversal). */
export function persistCameraSignature(camera: PersistCamera): string {
  return JSON.stringify({
    scrollX: roundCam(camera.scrollX),
    scrollY: roundCam(camera.scrollY),
    zoom: roundCam(camera.zoom)
  })
}

/** Stable signature of pending Plate edits (small map — one entry per edited note). */
export function persistPlateSignature(plate: ReadonlyMap<string, unknown>): string {
  const entries = [...plate.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return JSON.stringify(entries)
}

/**
 * Combine the split parts into the canonical dirty-gate signature.
 * Content/plate/camera describe the persistible state; the concatenated form
 * keeps `shouldMarkDirty` as a plain string comparison.
 */
export function combinePersistSignatures(
  content: string | null,
  plate: string,
  camera: string
): string | null {
  if (content == null) return null
  return `${content}\u0001${plate}\u0001${camera}`
}

/**
 * Cheap scene-change detector: O(n) id:versionNonce list.
 * Recompute the full elements signature only when this key moves.
 */
export function elementsVersionKey(
  elements: readonly { id: string; versionNonce: number }[]
): string {
  let key = ''
  for (const el of elements) key += `${el.id}:${el.versionNonce};`
  return key
}

/**
 * Decide whether a new persist signature should mark the session dirty,
 * clear dirty (undo back to last saved), or no-op (same as pending).
 */
export function shouldMarkDirty(input: DirtyGateInput): DirtyGateResult {
  const { sig, lastSaved, pending, dirty } = input
  if (sig === lastSaved) {
    return dirty ? { action: 'clear' } : { action: 'noop' }
  }
  if (dirty && sig === pending) return { action: 'noop' }
  return { action: 'dirty', pending: sig }
}
