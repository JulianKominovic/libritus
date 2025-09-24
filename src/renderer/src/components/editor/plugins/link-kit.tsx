'use client'

import { LinkPlugin } from '@platejs/link/react'

import { LinkElement } from '@renderer/components/ui/link-node'
import { LinkFloatingToolbar } from '@renderer/components/ui/link-toolbar'

export const LinkKit = [
  LinkPlugin.configure({
    render: {
      node: LinkElement,
      afterEditable: () => <LinkFloatingToolbar />
    }
  })
]
