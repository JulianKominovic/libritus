'use client'

import { TogglePlugin } from '@platejs/toggle/react'

import { IndentKit } from '@renderer/components/editor/plugins/indent-kit'
import { ToggleElement } from '@renderer/components/ui/toggle-node'

export const ToggleKit = [...IndentKit, TogglePlugin.withComponent(ToggleElement)]
