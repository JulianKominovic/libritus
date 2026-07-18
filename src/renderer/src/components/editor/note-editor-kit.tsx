import { TrailingBlockPlugin } from 'platejs'

import { AlignKit } from '@renderer/components/editor/plugins/align-kit'
import { AutoformatKit } from '@renderer/components/editor/plugins/autoformat-kit'
import { BasicBlocksKit } from '@renderer/components/editor/plugins/basic-blocks-kit'
import { BasicMarksKit } from '@renderer/components/editor/plugins/basic-marks-kit'
import { BlockPlaceholderKit } from '@renderer/components/editor/plugins/block-placeholder-kit'
import { CalloutKit } from '@renderer/components/editor/plugins/callout-kit'
import { CodeBlockKit } from '@renderer/components/editor/plugins/code-block-kit'
import { ColumnKit } from '@renderer/components/editor/plugins/column-kit'
import { DateKit } from '@renderer/components/editor/plugins/date-kit'
import { ExitBreakKit } from '@renderer/components/editor/plugins/exit-break-kit'
import { FontKit } from '@renderer/components/editor/plugins/font-kit'
import { LineHeightKit } from '@renderer/components/editor/plugins/line-height-kit'
import { LinkKit } from '@renderer/components/editor/plugins/link-kit'
import { ListKit } from '@renderer/components/editor/plugins/list-kit'
import { MarkdownKit } from '@renderer/components/editor/plugins/markdown-kit'
import { MathKit } from '@renderer/components/editor/plugins/math-kit'
import { MediaKit } from '@renderer/components/editor/plugins/media-kit'
import { MentionKit } from '@renderer/components/editor/plugins/mention-kit'
import { TableKit } from '@renderer/components/editor/plugins/table-kit'
import { TocKit } from '@renderer/components/editor/plugins/toc-kit'
import { ToggleKit } from '@renderer/components/editor/plugins/toggle-kit'

/**
 * Editable canvas notes — same schema as BaseEditorKit, without AI / collab / toolbars.
 * Full EditorKit's AIChatPlugin useChat → setOption('chat') loops on mount in a HUD.
 */
export const NoteEditorKit = [
  ...BasicBlocksKit,
  ...CodeBlockKit,
  ...TableKit,
  ...ToggleKit,
  ...TocKit,
  ...MediaKit,
  ...CalloutKit,
  ...ColumnKit,
  ...MathKit,
  ...DateKit,
  ...LinkKit,
  ...MentionKit,
  ...BasicMarksKit,
  ...FontKit,
  ...ListKit,
  ...AlignKit,
  ...LineHeightKit,
  ...AutoformatKit,
  ...ExitBreakKit,
  TrailingBlockPlugin,
  ...MarkdownKit,
  ...BlockPlaceholderKit
]
