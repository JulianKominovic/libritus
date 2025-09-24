'use client'

import * as React from 'react'

import type { TComboboxInputElement, TMentionElement } from 'platejs'
import type { PlateElementProps } from 'platejs/react'

import { getMentionOnSelectItem } from '@platejs/mention'
import { KEYS } from 'platejs'
import { PlateElement, useFocused, useReadOnly, useSelected } from 'platejs/react'

import { cn } from '@renderer/lib/utils'

import { Category, Pdf, usePdfs } from '@renderer/stores/categories'
import { DynamicIcon } from 'lucide-react/dynamic'
import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxGroupLabel,
  InlineComboboxInput,
  InlineComboboxItem
} from './inline-combobox'

export function parseKey(key: string) {
  try {
    return JSON.parse(key) as {
      categoryId?: string
      pdfId?: string
      highlightId?: string
      essayId?: string
    }
  } catch {
    return null
  }
}
export function MentionElement(
  props: PlateElementProps<TMentionElement> & {
    prefix?: string
  }
) {
  const element = props.element
  const key = element.key as string
  const parsedKey = parseKey(key)
  const categories = usePdfs((s) => s.categories)
  const category = categories.find((c) => c.id === parsedKey?.categoryId)
  const pdf = category?.pdfs.find((p) => p.id === parsedKey?.pdfId)
  const highlight = pdf?.highlights?.find((h) => h.id === parsedKey?.highlightId)
  const essay = pdf?.essays?.find((e) => e.id === parsedKey?.essayId)

  const selected = useSelected()
  const focused = useFocused()
  // const mounted = useMounted()
  const readOnly = useReadOnly()

  return (
    <PlateElement
      {...props}
      className={cn(
        'inline-flex items-center gap-2 flex-wrap rounded-md bg-muted px-1.5 py-0.5 align-baseline text-sm font-medium',
        !readOnly && 'cursor-pointer',
        selected && focused && 'ring-2 ring-ring',
        element.children[0][KEYS.bold] === true && 'font-bold',
        element.children[0][KEYS.italic] === true && 'italic',
        element.children[0][KEYS.underline] === true && 'underline'
      )}
      attributes={{
        ...props.attributes,
        contentEditable: false,
        'data-slate-value': element.value,
        draggable: true
      }}
    >
      {highlight ? (
        <HighlightMention highlight={{ ...highlight, pdf: pdf! }} />
      ) : essay ? (
        <EssayMention essay={{ ...essay, pdf: pdf! }} />
      ) : pdf ? (
        <PdfMention pdf={pdf} />
      ) : category ? (
        <CategoryMention category={category} />
      ) : null}
    </PlateElement>
  )
}

const onSelectItem = getMentionOnSelectItem()
export function PdfMention({ pdf }: { pdf: Pdf }) {
  return (
    <>
      {pdf.name}
      <small className="text-morphing-700 font-serif"> {pdf.author} </small>
    </>
  )
}
export function CategoryMention({ category }: { category: Category }) {
  return (
    <>
      <p className="flex items-center gap-2">
        <DynamicIcon name={category.icon} size={16} style={{ color: category.color }} />
        {category.name}
      </p>
      <small className="text-morphing-700 font-serif">{category.pdfs.length} PDFs</small>
    </>
  )
}

export function HighlightMention({
  highlight
}: {
  highlight: NonNullable<Pdf['highlights']>[0] & { pdf: Pdf }
}) {
  return (
    <>
      <i className="flex items-center gap-2">{highlight.text}</i>
      <small className="text-morphing-700 font-serif">from {highlight.pdf.name}</small>
    </>
  )
}

export function EssayMention({ essay }: { essay: NonNullable<Pdf['essays']>[0] & { pdf: Pdf } }) {
  return (
    <>
      {essay.text?.slice(0, 50)}...
      <small className="text-morphing-700 font-serif">from {essay.pdf.name}</small>
    </>
  )
}

export function MentionInputElement(props: PlateElementProps<TComboboxInputElement>) {
  const { editor, element } = props
  const [search, setSearch] = React.useState('')
  const categories = usePdfs((s) => s.categories)
  const pdfs = categories.flatMap((category) =>
    category.pdfs.map((p) => ({ ...p, category: category }))
  )
  const highlights = pdfs.flatMap((pdf) => pdf.highlights?.map((h) => ({ ...h, pdf: pdf })))
  const essays = pdfs.flatMap((pdf) => pdf.essays?.map((e) => ({ ...e, pdf: pdf })))
  return (
    <PlateElement {...props} as="span">
      <InlineCombobox
        value={search}
        element={element}
        setValue={setSearch}
        showTrigger={false}
        trigger="@"
      >
        <span className="inline-block rounded-md bg-muted px-1.5 py-0.5 align-baseline text-sm ring-ring focus-within:ring-2">
          <InlineComboboxInput />
        </span>

        <InlineComboboxContent className="my-1.5">
          <InlineComboboxEmpty>No results</InlineComboboxEmpty>

          <InlineComboboxGroup>
            <InlineComboboxGroupLabel>Categories</InlineComboboxGroupLabel>
            {categories.map((category) => {
              const id = category.id
              return (
                <InlineComboboxItem
                  className="h-auto flex-col gap-1 items-start"
                  style={{}}
                  key={id}
                  value={category.name}
                  onClick={() =>
                    onSelectItem(
                      editor,
                      {
                        text: category.name,
                        key: JSON.stringify({ categoryId: id })
                      },
                      search
                    )
                  }
                >
                  <CategoryMention category={category} />
                </InlineComboboxItem>
              )
            })}
          </InlineComboboxGroup>
          <InlineComboboxGroup>
            <InlineComboboxGroupLabel>PDFs</InlineComboboxGroupLabel>
            {pdfs.map((pdf) => {
              const id = pdf.id
              return (
                <InlineComboboxItem
                  className="h-auto flex-col gap-1 items-start"
                  key={id}
                  value={pdf.name}
                  onClick={() =>
                    onSelectItem(
                      editor,
                      {
                        text: pdf.name,
                        key: JSON.stringify({
                          categoryId: pdf.category.id,
                          pdfId: id
                        })
                      },
                      search
                    )
                  }
                >
                  <PdfMention pdf={pdf} />
                </InlineComboboxItem>
              )
            })}
          </InlineComboboxGroup>
          <InlineComboboxGroup>
            <InlineComboboxGroupLabel>Highlights</InlineComboboxGroupLabel>
            {highlights.map((highlight) => {
              if (!highlight) return null
              const id = highlight.id
              const text = highlight.text.slice(0, 50)
              return (
                <InlineComboboxItem
                  className="h-auto flex-col gap-1 items-start"
                  key={id}
                  value={text}
                  onClick={() =>
                    onSelectItem(
                      editor,
                      {
                        text: text,
                        key: JSON.stringify({
                          categoryId: highlight.pdf.category.id,
                          pdfId: highlight.pdf.id,
                          highlightId: id
                        })
                      },
                      search
                    )
                  }
                >
                  <HighlightMention highlight={highlight} />
                </InlineComboboxItem>
              )
            })}
          </InlineComboboxGroup>

          <InlineComboboxGroup>
            <InlineComboboxGroupLabel>Essays</InlineComboboxGroupLabel>
            {essays.map((essay) => {
              if (!essay || !essay.text) return null
              const id = essay.id
              const text = essay.text.slice(0, 50)
              return (
                <InlineComboboxItem
                  className="h-auto flex-col gap-1 items-start"
                  key={id}
                  value={text}
                  onClick={() =>
                    onSelectItem(
                      editor,
                      {
                        text: text || '',
                        key: JSON.stringify({
                          categoryId: essay.pdf.category.id,
                          pdfId: essay.pdf.id,
                          essayId: id
                        })
                      },
                      search
                    )
                  }
                >
                  <EssayMention essay={essay} />
                </InlineComboboxItem>
              )
            })}
          </InlineComboboxGroup>
        </InlineComboboxContent>
      </InlineCombobox>

      {props.children}
    </PlateElement>
  )
}
