import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { isPdfHighlight } from './pdfHighlightModel'

/**
 * Permanently host-locked PDF artifacts — UnlockPopup must not target these.
 * Arrow flags inlined (same as isPdfNoteArrow / isPdfSearchArrow) so unit tests
 * do not pull @excalidraw/excalidraw via pdfNotes / pdfSearchCapture.
 */
export function isHostLockedPdfArtifact(el: ExcalidrawElement): boolean {
  if (isPdfHighlight(el)) return true
  if (el.type !== 'arrow') return false
  return el.customData?.pdfNoteArrow === true || el.customData?.pdfSearchArrow === true
}

/**
 * Whether Excalidraw's UnlockPopup for `activeLockedId` should be cleared.
 * Resolves by element id, else as an Excalidraw group id (all members host artifacts).
 */
export function shouldSuppressUnlockPopup(
  activeLockedId: string | null,
  elements: readonly ExcalidrawElement[]
): boolean {
  if (!activeLockedId) return false

  const byId = elements.find((el) => !el.isDeleted && el.id === activeLockedId)
  if (byId) return isHostLockedPdfArtifact(byId)

  const groupMembers = elements.filter(
    (el) => !el.isDeleted && el.groupIds.includes(activeLockedId)
  )
  return groupMembers.length > 0 && groupMembers.every(isHostLockedPdfArtifact)
}
