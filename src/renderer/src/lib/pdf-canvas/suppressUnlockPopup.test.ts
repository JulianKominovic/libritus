import { describe, expect, test } from 'bun:test'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import {
  isHostLockedPdfArtifact,
  shouldSuppressUnlockPopup
} from './suppressUnlockPopup'

function baseEl(
  partial: Partial<OrderedExcalidrawElement> & { id: string }
): OrderedExcalidrawElement {
  return {
    type: 'rectangle',
    x: 0,
    y: 0,
    width: 40,
    height: 16,
    angle: 0,
    strokeColor: '#000',
    backgroundColor: '#fff',
    fillStyle: 'solid',
    strokeWidth: 1,
    strokeStyle: 'solid',
    roughness: 0,
    opacity: 100,
    groupIds: [],
    frameId: null,
    index: null,
    roundness: null,
    seed: 1,
    version: 1,
    versionNonce: 1,
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: true,
    ...partial
  } as OrderedExcalidrawElement
}

describe('suppressUnlockPopup', () => {
  test('isHostLockedPdfArtifact', () => {
    expect(
      isHostLockedPdfArtifact(
        baseEl({ id: 'h', customData: { pdfHighlight: true, text: 't', groupId: 'g' } })
      )
    ).toBe(true)
    expect(
      isHostLockedPdfArtifact(
        baseEl({
          id: 'a',
          type: 'arrow',
          points: [
            [0, 0],
            [10, 0]
          ],
          customData: { pdfNoteArrow: true, noteId: 'n' }
        } as Partial<OrderedExcalidrawElement> & { id: string })
      )
    ).toBe(true)
    expect(
      isHostLockedPdfArtifact(
        baseEl({
          id: 's',
          type: 'arrow',
          points: [
            [0, 0],
            [10, 0]
          ],
          customData: { pdfSearchArrow: true, captureId: 'c' }
        } as Partial<OrderedExcalidrawElement> & { id: string })
      )
    ).toBe(true)
    expect(isHostLockedPdfArtifact(baseEl({ id: 'plain' }))).toBe(false)
  })

  test('shouldSuppressUnlockPopup: null → false', () => {
    expect(shouldSuppressUnlockPopup(null, [])).toBe(false)
  })

  test('shouldSuppressUnlockPopup: highlight / noteArrow / searchArrow ids', () => {
    const highlight = baseEl({
      id: 'h1',
      customData: { pdfHighlight: true, text: 't', groupId: 'g' }
    })
    const noteArrow = baseEl({
      id: 'na',
      type: 'arrow',
      points: [
        [0, 0],
        [10, 0]
      ],
      customData: { pdfNoteArrow: true, noteId: 'n' }
    } as Partial<OrderedExcalidrawElement> & { id: string })
    const searchArrow = baseEl({
      id: 'sa',
      type: 'arrow',
      points: [
        [0, 0],
        [10, 0]
      ],
      customData: { pdfSearchArrow: true, captureId: 'c' }
    } as Partial<OrderedExcalidrawElement> & { id: string })
    const elements = [highlight, noteArrow, searchArrow]

    expect(shouldSuppressUnlockPopup('h1', elements)).toBe(true)
    expect(shouldSuppressUnlockPopup('na', elements)).toBe(true)
    expect(shouldSuppressUnlockPopup('sa', elements)).toBe(true)
  })

  test('shouldSuppressUnlockPopup: plain locked rect → false', () => {
    const plain = baseEl({ id: 'plain', locked: true })
    expect(shouldSuppressUnlockPopup('plain', [plain])).toBe(false)
  })

  test('shouldSuppressUnlockPopup: empty / unknown group → false', () => {
    const plain = baseEl({ id: 'plain', groupIds: ['g1'] })
    expect(shouldSuppressUnlockPopup('missing', [plain])).toBe(false)
    expect(shouldSuppressUnlockPopup('other', [plain])).toBe(false)
  })

  test('shouldSuppressUnlockPopup: Excalidraw group of host artifacts → true', () => {
    const a = baseEl({
      id: 'h1',
      groupIds: ['grp'],
      customData: { pdfHighlight: true, text: 't', groupId: 'g' }
    })
    const b = baseEl({
      id: 'h2',
      groupIds: ['grp'],
      customData: { pdfHighlight: true, text: 't', groupId: 'g' }
    })
    expect(shouldSuppressUnlockPopup('grp', [a, b])).toBe(true)
  })

  test('shouldSuppressUnlockPopup: mixed group → false', () => {
    const host = baseEl({
      id: 'h1',
      groupIds: ['grp'],
      customData: { pdfHighlight: true, text: 't', groupId: 'g' }
    })
    const plain = baseEl({ id: 'plain', groupIds: ['grp'] })
    expect(shouldSuppressUnlockPopup('grp', [host, plain])).toBe(false)
  })
})
