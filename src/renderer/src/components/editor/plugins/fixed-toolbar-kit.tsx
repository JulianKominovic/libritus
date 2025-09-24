'use client'

import { createPlatePlugin } from 'platejs/react'

import { FixedToolbar } from '@renderer/components//ui/fixed-toolbar'
import { FixedToolbarButtons } from '@renderer/components//ui/fixed-toolbar-buttons'

export const FixedToolbarKit = [
  createPlatePlugin({
    key: 'fixed-toolbar',
    render: {
      beforeEditable: () => (
        <FixedToolbar>
          <FixedToolbarButtons />
        </FixedToolbar>
      )
    }
  })
]
