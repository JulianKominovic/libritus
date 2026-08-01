import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'

/** Null if missing or already destroyed (`get*` throws after @next unmount). */
export function liveExcalidrawApi(
  api: ExcalidrawImperativeAPI | null | undefined
): ExcalidrawImperativeAPI | null {
  return api && !api.isDestroyed ? api : null
}

/** Lock/unlock the selection tool (place-note / place-browser modes). */
export function setSelectionToolLocked(
  api: ExcalidrawImperativeAPI | null | undefined,
  locked: boolean
): void {
  liveExcalidrawApi(api)?.updateScene({
    appState: {
      activeTool: {
        type: 'selection',
        locked,
        lastActiveTool: null,
        customType: null,
        fromSelection: false
      }
    }
  })
}
