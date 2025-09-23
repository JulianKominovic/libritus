import { HighlightColorEnum } from '@/stores/categories'
import { createColorPalette } from './colors'

export function getHightBaseColor(color: HighlightColorEnum) {
  switch (color) {
    case HighlightColorEnum.Lime:
      return '#99ff00'
    case HighlightColorEnum.Cyan:
      return '#00d9ff'
  }
  return '#e100ff'
}

export function getHighlightColor(color: HighlightColorEnum) {
  return createColorPalette(getHightBaseColor(color))
}
