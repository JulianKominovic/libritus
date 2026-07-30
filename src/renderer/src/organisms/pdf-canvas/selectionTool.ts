import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'

/** Lock/unlock the selection tool (place-note / place-browser modes). */
export function setSelectionToolLocked(
  api: ExcalidrawImperativeAPI | null | undefined,
  locked: boolean
): void {
  api?.updateScene({
    appState: {
      activeTool: {
        type: 'selection',
        locked,
        lastActiveTool: null,
        customType: null
      }
    }
  })
}
