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
  | { action: 'clear' }
  | { action: 'noop' }
  | { action: 'dirty'; pending: string }

const roundCam = (n: number) => Math.round(n * 1000) / 1000

/**
 * Excalidraw bumps these on every newElementWith / scene touch.
 * Including them in the dirty signature retriggers markUnsaved on every
 * onChange and permanently resets the autosave debounce.
 */
function stabilizeElement(el: unknown): unknown {
  if (!el || typeof el !== 'object') return el
  const { version: _v, versionNonce: _vn, updated: _u, ...rest } = el as Record<
    string,
    unknown
  >
  return rest
}

/** Stable signature of elements + camera for dirty detection. */
export function persistSignature(
  elements: readonly unknown[],
  camera: PersistCamera
): string {
  return JSON.stringify({
    elements: elements.map(stabilizeElement),
    camera: {
      scrollX: roundCam(camera.scrollX),
      scrollY: roundCam(camera.scrollY),
      zoom: roundCam(camera.zoom)
    }
  })
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
