'use client'

import { SlashInputPlugin, SlashPlugin } from '@platejs/slash-command/react'
import { KEYS } from 'platejs'

import { NoteSlashInputElement } from '@renderer/components/ui/note-slash-node'

export const NoteSlashKit = [
  SlashPlugin.configure({
    options: {
      triggerQuery: (editor) =>
        !editor.api.some({
          match: { type: editor.getType(KEYS.codeBlock) }
        })
    }
  }),
  SlashInputPlugin.withComponent(NoteSlashInputElement)
]
