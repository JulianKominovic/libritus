'use client'

import { createPlatePlugin } from 'platejs/react'

import { FixedToolbar } from '@renderer/components/ui/fixed-toolbar'
import { NoteFixedToolbarButtons } from '@renderer/components/ui/note-fixed-toolbar-buttons'

export const NoteFixedToolbarKit = [
  createPlatePlugin({
    key: 'note-fixed-toolbar',
    render: {
      beforeEditable: () => (
        <FixedToolbar>
          <NoteFixedToolbarButtons />
        </FixedToolbar>
      )
    }
  })
]
