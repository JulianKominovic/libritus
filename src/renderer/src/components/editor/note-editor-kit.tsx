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
import { EmojiKit } from '@renderer/components/editor/plugins/emoji-kit'
import { ExitBreakKit } from '@renderer/components/editor/plugins/exit-break-kit'
import { FontKit } from '@renderer/components/editor/plugins/font-kit'
import { LineHeightKit } from '@renderer/components/editor/plugins/line-height-kit'
import { LinkKit } from '@renderer/components/editor/plugins/link-kit'
import { ListKit } from '@renderer/components/editor/plugins/list-kit'
import { MarkdownKit } from '@renderer/components/editor/plugins/markdown-kit'
import { MathKit } from '@renderer/components/editor/plugins/math-kit'
import { MediaKit } from '@renderer/components/editor/plugins/media-kit'
import { MentionKit } from '@renderer/components/editor/plugins/mention-kit'
import { NoteFixedToolbarKit } from '@renderer/components/editor/plugins/note-fixed-toolbar-kit'
import { NoteFloatingToolbarKit } from '@renderer/components/editor/plugins/note-floating-toolbar-kit'
import { NoteSlashKit } from '@renderer/components/editor/plugins/note-slash-kit'
import { TableKit } from '@renderer/components/editor/plugins/table-kit'
import { TocKit } from '@renderer/components/editor/plugins/toc-kit'
import { ToggleKit } from '@renderer/components/editor/plugins/toggle-kit'

/**
 * Editable canvas notes — same schema as essays, without AI / collab.
 * Toolbars + slash/emoji included; AIChatPlugin useChat loops on mount in the embed.
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
  ...NoteSlashKit,
  ...AutoformatKit,
  ...EmojiKit,
  ...ExitBreakKit,
  TrailingBlockPlugin,
  ...MarkdownKit,
  ...BlockPlaceholderKit,
  ...NoteFixedToolbarKit,
  ...NoteFloatingToolbarKit
]
