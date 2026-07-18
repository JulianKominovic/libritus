'use client'

import {
  BlockquoteRules,
  BoldRules,
  CodeRules,
  HeadingRules,
  HighlightRules,
  HorizontalRuleRules,
  ItalicRules,
  MarkComboRules,
  StrikethroughRules,
  SubscriptRules,
  SuperscriptRules,
  UnderlineRules
} from '@platejs/basic-nodes'
import {
  BlockquotePlugin,
  BoldPlugin,
  CodePlugin,
  H1Plugin,
  H2Plugin,
  H3Plugin,
  H4Plugin,
  H5Plugin,
  H6Plugin,
  HighlightPlugin,
  HorizontalRulePlugin,
  ItalicPlugin,
  StrikethroughPlugin,
  SubscriptPlugin,
  SuperscriptPlugin,
  UnderlinePlugin
} from '@platejs/basic-nodes/react'
import { CodeBlockRules } from '@platejs/code-block'
import { CodeBlockPlugin } from '@platejs/code-block/react'
import { BulletedListRules, OrderedListRules, TaskListRules } from '@platejs/list'
import { ListPlugin } from '@platejs/list/react'
import { createSlatePlugin, createTextSubstitutionInputRule, KEYS } from 'platejs'

const notInCodeBlock = ({
  editor
}: {
  editor: { api: { some: (o: object) => boolean }; getType: (k: string) => string }
}) =>
  !editor.api.some({
    match: { type: editor.getType(KEYS.codeBlock) }
  })

// ponytail: text substitutions + markdown inputRules on feature plugins (Plate 53 AutoformatPlugin is inert)
const TextSubstitutionPlugin = createSlatePlugin({
  key: 'textSubstitution',
  inputRules: [
    createTextSubstitutionInputRule({
      patterns: [
        { match: '--', trigger: '-', format: '—' },
        { match: '...', trigger: '.', format: '…' },
        { match: '->', trigger: '>', format: '→' },
        { match: '<-', trigger: '-', format: '←' },
        { match: '!=', trigger: '=', format: '≠' },
        { match: '<=', trigger: '=', format: '≤' },
        { match: '>=', trigger: '=', format: '≥' }
      ]
    })
  ]
})

export const AutoformatKit = [
  TextSubstitutionPlugin,
  BoldPlugin.configure({
    inputRules: [
      BoldRules.markdown({ enabled: notInCodeBlock }),
      MarkComboRules.markdown({ variant: 'boldItalic', enabled: notInCodeBlock }),
      MarkComboRules.markdown({ variant: 'boldUnderline', enabled: notInCodeBlock }),
      MarkComboRules.markdown({ variant: 'boldItalicUnderline', enabled: notInCodeBlock }),
      MarkComboRules.markdown({ variant: 'italicUnderline', enabled: notInCodeBlock })
    ]
  }),
  ItalicPlugin.configure({ inputRules: [ItalicRules.markdown({ enabled: notInCodeBlock })] }),
  UnderlinePlugin.configure({
    inputRules: [UnderlineRules.markdown({ enabled: notInCodeBlock })]
  }),
  StrikethroughPlugin.configure({
    inputRules: [StrikethroughRules.markdown({ enabled: notInCodeBlock })]
  }),
  CodePlugin.configure({ inputRules: [CodeRules.markdown({ enabled: notInCodeBlock })] }),
  HighlightPlugin.configure({
    inputRules: [HighlightRules.markdown({ enabled: notInCodeBlock })]
  }),
  SubscriptPlugin.configure({
    inputRules: [SubscriptRules.markdown({ enabled: notInCodeBlock })]
  }),
  SuperscriptPlugin.configure({
    inputRules: [SuperscriptRules.markdown({ enabled: notInCodeBlock })]
  }),
  H1Plugin.configure({ inputRules: [HeadingRules.markdown({ enabled: notInCodeBlock })] }),
  H2Plugin.configure({ inputRules: [HeadingRules.markdown({ enabled: notInCodeBlock })] }),
  H3Plugin.configure({ inputRules: [HeadingRules.markdown({ enabled: notInCodeBlock })] }),
  H4Plugin.configure({ inputRules: [HeadingRules.markdown({ enabled: notInCodeBlock })] }),
  H5Plugin.configure({ inputRules: [HeadingRules.markdown({ enabled: notInCodeBlock })] }),
  H6Plugin.configure({ inputRules: [HeadingRules.markdown({ enabled: notInCodeBlock })] }),
  BlockquotePlugin.configure({
    inputRules: [BlockquoteRules.markdown({ enabled: notInCodeBlock })]
  }),
  HorizontalRulePlugin.configure({
    inputRules: [HorizontalRuleRules.markdown({ enabled: notInCodeBlock })]
  }),
  CodeBlockPlugin.configure({
    inputRules: [CodeBlockRules.markdown({ on: 'match', enabled: notInCodeBlock })]
  }),
  ListPlugin.configure({
    inputRules: [
      BulletedListRules.markdown({ enabled: notInCodeBlock }),
      OrderedListRules.markdown({ enabled: notInCodeBlock }),
      TaskListRules.markdown({ enabled: notInCodeBlock })
    ]
  })
]
