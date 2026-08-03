const MIN_RECT_AREA = 1

export type ClientBox = {
  left: number
  top: number
  right: number
  bottom: number
}

function boxHeight(box: ClientBox): number {
  return box.bottom - box.top
}

function sameLine(a: ClientBox, b: ClientBox): boolean {
  const aMid = (a.top + a.bottom) / 2
  const bMid = (b.top + b.bottom) / 2
  const tolerance = Math.min(boxHeight(a), boxHeight(b)) * 0.5
  return Math.abs(aMid - bMid) <= tolerance
}

/**
 * Merge client rects that sit on the same visual text line into one union box
 * per line. Engine text runs often emit multiple overlapping boxes per row.
 */
export function mergeSameLineRects(
  rects: ArrayLike<Pick<ClientBox, 'left' | 'top' | 'right' | 'bottom'> & { width?: number; height?: number }>
): ClientBox[] {
  const boxes: ClientBox[] = []
  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i]!
    const width = 'width' in rect && typeof rect.width === 'number' ? rect.width : rect.right - rect.left
    const height =
      'height' in rect && typeof rect.height === 'number' ? rect.height : rect.bottom - rect.top
    if (width * height < MIN_RECT_AREA) continue
    boxes.push({
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom
    })
  }

  boxes.sort((a, b) => a.top - b.top || a.left - b.left)

  const merged: ClientBox[] = []
  for (const box of boxes) {
    const last = merged[merged.length - 1]
    if (last && sameLine(last, box)) {
      last.left = Math.min(last.left, box.left)
      last.top = Math.min(last.top, box.top)
      last.right = Math.max(last.right, box.right)
      last.bottom = Math.max(last.bottom, box.bottom)
    } else {
      merged.push({ ...box })
    }
  }

  return merged
}
