'use client'

import { createPlatePlugin } from 'platejs/react'

import { NoteFloatingToolbar } from '@renderer/components/ui/note-floating-toolbar'
import { NoteFloatingToolbarButtons } from '@renderer/components/ui/note-floating-toolbar-buttons'

export const NoteFloatingToolbarKit = [
  createPlatePlugin({
    key: 'note-floating-toolbar',
    render: {
      afterEditable: () => (
        <NoteFloatingToolbar>
          <NoteFloatingToolbarButtons />
        </NoteFloatingToolbar>
      )
    }
  })
]
