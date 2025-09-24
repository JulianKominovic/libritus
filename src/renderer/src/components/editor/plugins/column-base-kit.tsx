import { BaseColumnItemPlugin, BaseColumnPlugin } from '@platejs/layout'

import {
  ColumnElementStatic,
  ColumnGroupElementStatic
} from '@renderer/components//ui/column-node-static'

export const BaseColumnKit = [
  BaseColumnPlugin.withComponent(ColumnGroupElementStatic),
  BaseColumnItemPlugin.withComponent(ColumnElementStatic)
]
