import { TrailingBlockPlugin, type Value } from 'platejs'
import { type TPlateEditor, useEditorRef } from 'platejs/react'

import { AIKit } from '@renderer/components/editor/plugins/ai-kit'
import { AlignKit } from '@renderer/components/editor/plugins/align-kit'
import { AutoformatKit } from '@renderer/components/editor/plugins/autoformat-kit'
import { BasicBlocksKit } from '@renderer/components/editor/plugins/basic-blocks-kit'
import { BasicMarksKit } from '@renderer/components/editor/plugins/basic-marks-kit'
import { BlockMenuKit } from '@renderer/components/editor/plugins/block-menu-kit'
import { BlockPlaceholderKit } from '@renderer/components/editor/plugins/block-placeholder-kit'
import { CalloutKit } from '@renderer/components/editor/plugins/callout-kit'
import { CodeBlockKit } from '@renderer/components/editor/plugins/code-block-kit'
import { ColumnKit } from '@renderer/components/editor/plugins/column-kit'
import { CommentKit } from '@renderer/components/editor/plugins/comment-kit'
import { CopilotKit } from '@renderer/components/editor/plugins/copilot-kit'
import { CursorOverlayKit } from '@renderer/components/editor/plugins/cursor-overlay-kit'
import { DateKit } from '@renderer/components/editor/plugins/date-kit'
import { DiscussionKit } from '@renderer/components/editor/plugins/discussion-kit'
// import { DndKit } from '@renderer/components/editor/plugins/dnd-kit'
import { DocxKit } from '@renderer/components/editor/plugins/docx-kit'
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
import { SlashKit } from '@renderer/components/editor/plugins/slash-kit'
import { SuggestionKit } from '@renderer/components/editor/plugins/suggestion-kit'
import { TableKit } from '@renderer/components/editor/plugins/table-kit'
import { TocKit } from '@renderer/components/editor/plugins/toc-kit'
import { ToggleKit } from '@renderer/components/editor/plugins/toggle-kit'
import { FixedToolbarKit } from './plugins/fixed-toolbar-kit'
import { FloatingToolbarKit } from './plugins/floating-toolbar-kit'

export const EditorKit = [
  ...CopilotKit,
  ...AIKit,

  // Elements
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

  // Marks
  ...BasicMarksKit,
  ...FontKit,

  // Block Style
  ...ListKit,
  ...AlignKit,
  ...LineHeightKit,

  // Collaboration
  ...DiscussionKit,
  ...CommentKit,
  ...SuggestionKit,

  // Editing
  ...SlashKit,
  ...AutoformatKit,
  ...CursorOverlayKit,
  ...BlockMenuKit,
  // ...DndKit,
  ...EmojiKit,
  ...ExitBreakKit,
  TrailingBlockPlugin,

  // Parsers
  ...DocxKit,
  ...MarkdownKit,

  // UI
  ...BlockPlaceholderKit,
  ...FixedToolbarKit,
  ...FloatingToolbarKit
]

export type MyEditor = TPlateEditor<Value, (typeof EditorKit)[number]>

export const useEditor = () => useEditorRef<MyEditor>()
