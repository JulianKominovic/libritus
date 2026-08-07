'use client'

import * as React from 'react'

import type { TResolvedSuggestion } from '@platejs/suggestion'

import {
  acceptSuggestion,
  getSuggestionKey,
  keyId2SuggestionId,
  rejectSuggestion
} from '@platejs/suggestion'
import { SuggestionPlugin } from '@platejs/suggestion/react'
import {
  ElementApi,
  KEYS,
  type NodeEntry,
  type Path,
  PathApi,
  type TElement,
  type TSuggestionElement,
  type TSuggestionText,
  TextApi
} from 'platejs'
import { useEditorPlugin, usePluginOption } from 'platejs/react'

import {
  type TDiscussion,
  discussionPlugin
} from '@renderer/components/editor/plugins/discussion-kit'
import { suggestionPlugin } from '@renderer/components/editor/plugins/suggestion-kit'
import { Avatar, AvatarFallback, AvatarImage } from '@renderer/components/ui/avatar'
import { Button } from '@renderer/components/ui/button'
import { useLang, type LangContextType } from '@renderer/i18n/lang-context'
import { cn } from '@renderer/lib/utils'

import { DynamicIcon } from 'lucide-react/dynamic'
import { Comment, CommentCreateForm, type TComment, formatCommentDate } from './comment'

export interface ResolvedSuggestion extends TResolvedSuggestion {
  comments: TComment[]
}

const BLOCK_SUGGESTION = '__block__'

const TYPE_TEXT_MAP: Record<string, (t: LangContextType['t'], node?: TElement) => string> = {
  [KEYS.audio]: (t) => t('editor_block_audio'),
  [KEYS.blockquote]: (t) => t('editor_block_blockquote'),
  [KEYS.callout]: (t) => t('editor_block_callout'),
  [KEYS.codeBlock]: (t) => t('editor_block_code'),
  [KEYS.column]: (t) => t('editor_block_column'),
  [KEYS.equation]: (t) => t('editor_block_equation'),
  [KEYS.file]: (t) => t('editor_block_file'),
  [KEYS.h1]: (t) => `${t('editor_block_heading')} 1`,
  [KEYS.h2]: (t) => `${t('editor_block_heading')} 2`,
  [KEYS.h3]: (t) => `${t('editor_block_heading')} 3`,
  [KEYS.h4]: (t) => `${t('editor_block_heading')} 4`,
  [KEYS.h5]: (t) => `${t('editor_block_heading')} 5`,
  [KEYS.h6]: (t) => `${t('editor_block_heading')} 6`,
  [KEYS.hr]: (t) => t('editor_block_horizontal_rule'),
  [KEYS.img]: (t) => t('editor_block_image'),
  [KEYS.mediaEmbed]: (t) => t('editor_block_media'),
  [KEYS.p]: (t, node) => {
    if (node?.[KEYS.listType] === KEYS.listTodo) return t('editor_block_todo')
    if (node?.[KEYS.listType] === KEYS.ol) return t('editor_block_ordered_list')
    if (node?.[KEYS.listType] === KEYS.ul) return t('editor_block_list')

    return t('editor_block_paragraph')
  },
  [KEYS.table]: (t) => t('editor_block_table'),
  [KEYS.toc]: (t) => t('editor_block_table_of_contents'),
  [KEYS.toggle]: (t) => t('editor_block_toggle'),
  [KEYS.video]: (t) => t('editor_block_video')
}

export function BlockSuggestion({ element }: { element: TSuggestionElement }) {
  const suggestionData = element.suggestion

  if (suggestionData?.isLineBreak) return null

  const isRemove = suggestionData?.type === 'remove'

  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 z-1 border-2 border-brand/[0.8] transition-opacity',
        isRemove && 'border-gray-300'
      )}
      contentEditable={false}
    />
  )
}

export function BlockSuggestionCard({
  idx,
  isLast,
  suggestion
}: {
  idx: number
  isLast: boolean
  suggestion: ResolvedSuggestion
}) {
  const { api, editor } = useEditorPlugin(SuggestionPlugin)

  const userInfo = usePluginOption(discussionPlugin, 'user', suggestion.userId)
  const { t } = useLang()

  const accept = (suggestion: ResolvedSuggestion) => {
    api.suggestion.withoutSuggestions(() => {
      acceptSuggestion(editor, suggestion)
    })
  }

  const reject = (suggestion: ResolvedSuggestion) => {
    api.suggestion.withoutSuggestions(() => {
      rejectSuggestion(editor, suggestion)
    })
  }

  const [hovering, setHovering] = React.useState(false)

  const suggestionText2Array = (text: string) => {
    if (text === BLOCK_SUGGESTION) return [t('suggestion_line_breaks')]

    return text.split(BLOCK_SUGGESTION).filter(Boolean)
  }

  const [editingId, setEditingId] = React.useState<string | null>(null)

  return (
    <div
      key={`${suggestion.suggestionId}-${idx}`}
      className="relative"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div className="flex flex-col p-4">
        <div className="relative flex items-center">
          {/* Replace to your own backend or refer to potion */}
          <Avatar className="size-5">
            <AvatarImage alt={userInfo?.name} src={userInfo?.avatarUrl} />
            <AvatarFallback>{userInfo?.name?.[0]}</AvatarFallback>
          </Avatar>
          <h4 className="mx-2 text-sm leading-none font-semibold">{userInfo?.name}</h4>
          <div className="text-xs leading-none text-muted-foreground/80">
            <span className="mr-1">{formatCommentDate(new Date(suggestion.createdAt))}</span>
          </div>
        </div>

        <div className="relative mt-1 mb-4 pl-[32px]">
          <div className="flex flex-col gap-2">
            {suggestion.type === 'remove' && (
              <React.Fragment>
                {suggestionText2Array(suggestion.text!).map((text, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{t('suggestion_delete')}</span>

                    <span key={index} className="text-sm">
                      {text}
                    </span>
                  </div>
                ))}
              </React.Fragment>
            )}

            {suggestion.type === 'insert' && (
              <React.Fragment>
                {suggestionText2Array(suggestion.newText!).map((text, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{t('suggestion_add')}</span>

                    <span key={index} className="text-sm">
                      {text || t('suggestion_line_breaks')}
                    </span>
                  </div>
                ))}
              </React.Fragment>
            )}

            {suggestion.type === 'replace' && (
              <div className="flex flex-col gap-2">
                {suggestionText2Array(suggestion.newText!).map((text, index) => (
                  <React.Fragment key={index}>
                    <div key={index} className="flex items-start gap-2 text-brand/80">
                      <span className="text-sm">{t('suggestion_with')}</span>
                      <span className="text-sm">{text || t('suggestion_line_breaks')}</span>
                    </div>
                  </React.Fragment>
                ))}

                {suggestionText2Array(suggestion.text!).map((text, index) => (
                  <React.Fragment key={index}>
                    <div key={index} className="flex items-start gap-2">
                      <span className="text-sm text-muted-foreground">
                        {index === 0 ? t('suggestion_replace') : t('suggestion_delete')}
                      </span>
                      <span className="text-sm">{text || t('suggestion_line_breaks')}</span>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            )}

            {suggestion.type === 'update' && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {Object.keys(suggestion.properties).map((key) => (
                    <span key={key}>Un{key}</span>
                  ))}

                  {Object.keys(suggestion.newProperties).map((key) => (
                    <span key={key}>{key.charAt(0).toUpperCase() + key.slice(1)}</span>
                  ))}
                </span>
                <span className="text-sm">{suggestion.newText}</span>
              </div>
            )}
          </div>
        </div>

        {suggestion.comments.map((comment, index) => (
          <Comment
            key={comment.id ?? index}
            comment={comment}
            discussionLength={suggestion.comments.length}
            documentContent="__suggestion__"
            editingId={editingId}
            index={index}
            setEditingId={setEditingId}
          />
        ))}

        {hovering && (
          <div className="absolute top-4 right-4 flex gap-2">
            <Button
              variant="ghost"
              className="size-6 p-1 text-muted-foreground"
              onClick={() => accept(suggestion)}
            >
              <DynamicIcon name="check" className="size-4" />
            </Button>

            <Button
              variant="ghost"
              className="size-6 p-1 text-muted-foreground"
              onClick={() => reject(suggestion)}
            >
              <DynamicIcon name="x" className="size-4" />
            </Button>
          </div>
        )}

        <CommentCreateForm discussionId={suggestion.suggestionId} />
      </div>

      {!isLast && <div className="h-px w-full bg-muted" />}
    </div>
  )
}

export const useResolveSuggestion = (
  suggestionNodes: NodeEntry<TElement | TSuggestionText>[],
  blockPath: Path
) => {
  const discussions = usePluginOption(discussionPlugin, 'discussions')
  const { t } = useLang()

  const { api, editor, getOption, setOption } = useEditorPlugin(suggestionPlugin)

  suggestionNodes.forEach(([node]) => {
    const id = api.suggestion.nodeId(node)
    const map = getOption('uniquePathMap')

    if (!id) return

    const previousPath = map.get(id)

    // If there are no suggestion nodes in the corresponding path in the map, then update it.
    if (PathApi.isPath(previousPath)) {
      const nodes = api.suggestion.node({ id, at: previousPath, isText: true })
      const parentNode = api.node(previousPath)
      let lineBreakId: string | null = null

      if (parentNode && ElementApi.isElement(parentNode[0])) {
        lineBreakId = api.suggestion.nodeId(parentNode[0]) ?? null
      }

      if (!nodes && lineBreakId !== id) {
        return setOption('uniquePathMap', new Map(map).set(id, blockPath))
      }

      return
    }
    setOption('uniquePathMap', new Map(map).set(id, blockPath))
  })

  const resolvedSuggestion: ResolvedSuggestion[] = React.useMemo(() => {
    const map = getOption('uniquePathMap')

    if (suggestionNodes.length === 0) return []

    const suggestionIds = new Set(
      suggestionNodes
        .flatMap(([node]) => {
          if (TextApi.isText(node)) {
            const dataList = api.suggestion.dataList(node)
            const includeUpdate = dataList.some((data) => data.type === 'update')

            if (!includeUpdate) return api.suggestion.nodeId(node)

            return dataList.filter((data) => data.type === 'update').map((d) => d.id)
          }
          if (ElementApi.isElement(node)) {
            return api.suggestion.nodeId(node)
          }
        })
        .filter(Boolean)
    )

    const res: ResolvedSuggestion[] = []

    suggestionIds.forEach((id) => {
      if (!id) return

      const path = map.get(id)

      if (!path || !PathApi.isPath(path)) return
      if (!PathApi.equals(path, blockPath)) return

      const entries = [
        ...editor.api.nodes<TElement | TSuggestionText>({
          at: [],
          mode: 'all',
          match: (n) =>
            (n[KEYS.suggestion] && n[getSuggestionKey(id)]) ||
            api.suggestion.nodeId(n as TElement) === id
        })
      ]

      // move line break to the end
      entries.sort(([, path1], [, path2]) => {
        return PathApi.isChild(path1, path2) ? -1 : 1
      })

      let newText = ''
      let text = ''
      let properties: any = {}
      let newProperties: any = {}

      // overlapping suggestion
      entries.forEach(([node]) => {
        if (TextApi.isText(node)) {
          const dataList = api.suggestion.dataList(node)

          dataList.forEach((data) => {
            if (data.id !== id) return

            switch (data.type) {
              case 'insert': {
                newText += node.text

                break
              }
              case 'remove': {
                text += node.text

                break
              }
              case 'update': {
                properties = {
                  ...properties,
                  ...data.properties
                }

                newProperties = {
                  ...newProperties,
                  ...data.newProperties
                }

                newText += node.text

                break
              }
              // No default
            }
          })
        } else {
          const lineBreakData = api.suggestion.isBlockSuggestion(node) ? node.suggestion : undefined

          if (lineBreakData?.id !== keyId2SuggestionId(id)) return
          if (lineBreakData.type === 'insert') {
            newText += lineBreakData.isLineBreak
              ? BLOCK_SUGGESTION
              : BLOCK_SUGGESTION + TYPE_TEXT_MAP[node.type](t, node)
          } else if (lineBreakData.type === 'remove') {
            text += lineBreakData.isLineBreak
              ? BLOCK_SUGGESTION
              : BLOCK_SUGGESTION + TYPE_TEXT_MAP[node.type](t, node)
          }
        }
      })

      if (entries.length === 0) return

      const nodeData = api.suggestion.suggestionData(entries[0][0])

      if (!nodeData) return

      // const comments = data?.discussions.find((d) => d.id === id)?.comments;
      const comments = discussions.find((s: TDiscussion) => s.id === id)?.comments || []
      const createdAt = new Date(nodeData.createdAt)

      const keyId = getSuggestionKey(id)

      if (nodeData.type === 'update') {
        return res.push({
          comments,
          createdAt,
          keyId,
          newProperties,
          newText,
          properties,
          suggestionId: keyId2SuggestionId(id),
          type: 'update',
          userId: nodeData.userId
        })
      }
      if (newText.length > 0 && text.length > 0) {
        return res.push({
          comments,
          createdAt,
          keyId,
          newText,
          suggestionId: keyId2SuggestionId(id),
          text,
          type: 'replace',
          userId: nodeData.userId
        })
      }
      if (newText.length > 0) {
        return res.push({
          comments,
          createdAt,
          keyId,
          newText,
          suggestionId: keyId2SuggestionId(id),
          type: 'insert',
          userId: nodeData.userId
        })
      }
      if (text.length > 0) {
        return res.push({
          comments,
          createdAt,
          keyId,
          suggestionId: keyId2SuggestionId(id),
          text,
          type: 'remove',
          userId: nodeData.userId
        })
      }
    })

    return res
  }, [api.suggestion, blockPath, discussions, editor.api, getOption, suggestionNodes, t])

  return resolvedSuggestion
}

export const isResolvedSuggestion = (
  suggestion: ResolvedSuggestion | TDiscussion
): suggestion is ResolvedSuggestion => {
  return 'suggestionId' in suggestion
}
