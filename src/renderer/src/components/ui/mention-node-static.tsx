import type { SlateElementProps, TMentionElement } from 'platejs'
import { KEYS, SlateElement } from 'platejs'

import { usePdfJump } from '@anaralabs/lector'
import { cn } from '@renderer/lib/utils'
import { usePdfs } from '@renderer/stores/categories'
import { useLocation } from 'wouter'
import {
  CategoryMention,
  EssayMention,
  HighlightMention,
  PageMention,
  parseKey,
  PdfMention
} from './mention-node'

export function MentionElementStatic(
  props: SlateElementProps<TMentionElement> & {
    prefix?: string
  }
) {
  const element = props.element
  const key = element.key as string
  const parsedKey = parseKey(key)
  const page = parsedKey?.page
  const categories = usePdfs((s) => s.categories)
  const category = categories.find((c) => c.id === parsedKey?.categoryId)
  const pdf = category?.pdfs.find((p) => p.id === parsedKey?.pdfId)
  const highlight = pdf?.highlights?.find((h) => h.id === parsedKey?.highlightId)
  const essay = pdf?.essays?.find((e) => e.id === parsedKey?.essayId)
  const [, navigate] = useLocation()
  const { jumpToPage } = usePdfJump()
  return (
    <SlateElement
      {...props}
      className={cn(
        'inline-flex items-center gap-2 flex-wrap rounded-md bg-muted px-1.5 py-0.5 align-baseline text-sm font-medium m-0.5',
        element.children[0][KEYS.bold] === true && 'font-bold',
        element.children[0][KEYS.italic] === true && 'italic',
        element.children[0][KEYS.underline] === true && 'underline'
      )}
      attributes={{
        ...props.attributes,
        'data-link': element.key,
        'data-slate-value': element.value,
        onClick: () => {
          if (page && pdf && category) return jumpToPage(page)
          if (pdf && category) return navigate(`/category/${category?.id}/${pdf.id}`)
          if (category) return navigate(`/category/${category.id}`)
        }
      }}
    >
      {page ? (
        <PageMention page={page} />
      ) : highlight ? (
        <HighlightMention highlight={{ ...highlight, pdf: pdf! }} />
      ) : essay ? (
        <EssayMention essay={{ ...essay, pdf: pdf! }} />
      ) : pdf ? (
        <PdfMention pdf={pdf} />
      ) : category ? (
        <CategoryMention category={category} />
      ) : null}
    </SlateElement>
  )
}
