/** biome-ignore-all lint/suspicious/noArrayIndexKey: Shut up 🔥🚒🧨 */

import { useSelectionDimensions } from '@anaralabs/lector'
import { openUrl } from '@tauri-apps/plugin-opener'
import { DynamicIcon } from 'lucide-react/dynamic'
import { useEffect, useRef, useState } from 'react'
import { useDebounceCallback } from 'usehooks-ts'
import { SelectionTooltip } from '@/components/pdf/selection-tooltip'
import { Button } from '@/components/ui/button'
import {
  type DictionaryApiResponse,
  WikiClient,
  type WikipediaDefinition
} from '@/integrations/wiktionary'
import { checkSelectionSource } from '@/lib/dom'
import { HighlightColorEnum, usePdfs } from '@/stores/categories'

type DefinitionState =
  | {
      text: string
      source: 'wikipedia'
      definition: WikipediaDefinition
      loading: boolean
    }
  | {
      text: string
      source: 'dictionary'
      definition: DictionaryApiResponse
      loading: boolean
    }

function DictionaryEntry({ text, definition, source, loading }: DefinitionState) {
  console.log({
    text,
    definition,
    source,
    loading
  })
  const phonetic = source === 'dictionary' && definition[0].phonetics.find((p) => p.audio)
  const flatDictionaryDefinition =
    source === 'dictionary' &&
    definition.flatMap((d) => {
      return d.meanings.flatMap((m) => {
        return m.definitions.map((d) => {
          return {
            ...d,
            partOfSpeech: m.partOfSpeech
          }
        })
      })
    })
  return (
    <div className="max-w-sm">
      <h4 className="text-morphing-900 font-semibold mb-1">
        {source === 'wikipedia' && definition.url ? (
          <>
            {definition.image && (
              <img
                src={definition.image}
                alt={text}
                className="size-20 mb-2 rounded-lg object-cover"
              />
            )}
            <a
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                openUrl(definition.url)
              }}
              href={definition.url}
              target="_blank"
              className="flex items-center gap-1"
            >
              {definition.title ||
                text.charAt(0).toLocaleUpperCase() + text.slice(1).toLocaleLowerCase()}{' '}
              <DynamicIcon name="external-link" className="size-4" />
            </a>
          </>
        ) : (
          text.charAt(0).toLocaleUpperCase() + text.slice(1).toLocaleLowerCase()
        )}
      </h4>
      {source === 'wikipedia' ? (
        <ul className="list-disc list-inside mb-2 space-y-1.5">
          {definition.sentences.slice(0, 3).map((definition, i) => (
            <li
              key={'definition-' + i}
              className="text-morphing-700 line-clamp-4 text-sm list-item list-inside list-disc"
            >
              {definition}
            </li>
          ))}
        </ul>
      ) : source === 'dictionary' && flatDictionaryDefinition ? (
        <ul className="list-disc list-inside mb-2 space-y-1.5">
          {flatDictionaryDefinition.map((meaning, i) => (
            <li
              key={'meaning-' + i}
              className="text-morphing-800 line-clamp-4 text-sm list-item list-inside list-disc"
            >
              <u>{meaning.partOfSpeech}</u> {meaning.definition}
              {meaning.example && <p className="text-morphing-700 text-xs">{meaning.example}</p>}
              {meaning.synonyms.length > 0 && (
                <p className="text-green-700 text-xs">
                  Synonyms: {Array.from(new Set(meaning.synonyms)).join(', ')}
                </p>
              )}
              {meaning.antonyms.length > 0 && (
                <p className="text-red-700 text-xs">
                  Antonyms: {Array.from(new Set(meaning.antonyms)).join(', ')}
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {source === 'dictionary' && phonetic && (
        <audio src={phonetic.audio} controls>
          <track kind="captions" />
        </audio>
      )}
      {source === 'wikipedia' ? (
        <small className="text-morphing-700 text-xs">
          Search can be inaccurate. Extracted from{' '}
          <a
            href={'https://wikipedia.org/'}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              openUrl('https://wikipedia.org/')
            }}
            target="_blank"
            className="flex items-center gap-1 underline"
            rel="noopener"
          >
            Wikipedia
          </a>
        </small>
      ) : (
        <small className="text-morphing-700 text-xs">
          Search can be inaccurate. Extracted from{' '}
          <a
            href={'https://dictionaryapi.dev/'}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              openUrl('https://dictionaryapi.dev/')
            }}
            target="_blank"
            className="flex items-center gap-1 underline"
            rel="noopener"
          >
            Dictionary API
          </a>
        </small>
      )}
    </div>
  )
}

// function AddNote({ back }: { back: () => void }) {
//   const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
//     e.preventDefault();
//     const formData = new FormData(e.target as HTMLFormElement);
//     const note = formData.get("note") as string;
//     console.log(note);
//   };
//   return (
//     <div
//       className="bg-white border border-morphing-300 shadow-lg shadow-morphing-900/20 mb-2 rounded-xl text-sm max-w-sm p-2 flex-wrap w-fit"
//       data-annotation-tooltip
//     >
//       <header className="flex items-center gap-2 pr-2 mb-2 w-full">
//         <Button
//           variant={"ghost"}
//           className="!px-2 !text-xs rounded-lg aspect-square size-8"
//           onClick={back}
//         >
//           <DynamicIcon name="chevron-left" className="size-4" />
//         </Button>
//         <h4 className="text-morphing-900 font-semibold text-end">Add note</h4>
//       </header>
//       <form onSubmit={handleSubmit}>
//         <Textarea tabIndex={0} placeholder="Write your note here..." />
//       </form>
//     </div>
//   );
// }

export default function SelectionMenu({
  categoryId,
  pdfId
}: {
  categoryId: string
  pdfId: string
}) {
  const selectionDimensions = useSelectionDimensions()
  const [definition, setDefinition] = useState<DefinitionState | null>(null)

  const abortController = useRef<AbortController | null>(null)
  const debouncedFetchDefinition = useDebounceCallback(async (word: string) => {
    abortController.current?.abort()
    abortController.current = new AbortController()
    const { signal } = abortController.current

    try {
      console.log('Fetching definition for', word)
      const dictionaryResult = await WikiClient.getDictionaryDefinition(word, signal)
      if (dictionaryResult) {
        return setDefinition({
          text: word,
          definition: dictionaryResult.result,
          source: 'dictionary',
          loading: false
        })
      }
      const wikipediaResult = await WikiClient.getWikipediaDefinition(word, signal)
      if (wikipediaResult) {
        return setDefinition({
          text: word,
          definition: wikipediaResult.result,
          source: 'wikipedia',
          loading: false
        })
      }
      setDefinition(null)
    } catch (error) {
      console.error('Error fetching definition', error)
      setDefinition(null)
    }
  }, 1000)
  const addHighlight = usePdfs((s) => s.addHighlightToPdf)

  async function handleHighlight(color: HighlightColorEnum) {
    const dimension = selectionDimensions.getDimension()
    if (dimension && !dimension.isCollapsed) {
      const filteredHighlightRects = dimension.highlights.filter(
        (rect) => rect.left > 0 && rect.top > 0
      )
      const id = crypto.randomUUID()
      await addHighlight(categoryId, pdfId, {
        color,
        createdAt: new Date(),
        updatedAt: new Date(),
        text: dimension.text,
        rects: filteredHighlightRects,
        id,
        comments: []
      })
      window.getSelection()?.removeAllRanges()
      return id
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: No need to add all dependencies
  useEffect(() => {
    function handleSelectionChange() {
      const comesFromPdfPage = checkSelectionSource(window.getSelection(), '[data-pdf-page]')
      abortController.current?.abort()
      abortController.current = new AbortController()
      setDefinition(null)
      const text = selectionDimensions.getDimension()?.text
      if (comesFromPdfPage && text && text.length < 40) {
        setDefinition({
          text,
          source: 'wikipedia',
          definition: {
            sentences: [],
            url: '',
            image: null,
            title: ''
          },
          loading: true
        })
        debouncedFetchDefinition(text)
      }
    }
    document.addEventListener('selectionchange', handleSelectionChange)
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)
    }
  }, [])

  return (
    <SelectionTooltip>
      <div className="bg-white border border-morphing-300 shadow-lg shadow-morphing-900/20 mb-2 rounded-xl text-sm max-w-sm p-1 flex items-center gap-2 flex-wrap w-fit pl-3">
        <button
          type="button"
          className="rounded-[50%] size-5 cursor-pointer bg-fuchsia-500"
          onClick={() => handleHighlight(HighlightColorEnum.Fuchsia)}
        ></button>
        <button
          type="button"
          className="rounded-[50%] size-5 cursor-pointer bg-lime-500"
          onClick={() => handleHighlight(HighlightColorEnum.Lime)}
        ></button>
        <button
          type="button"
          className="rounded-[50%] size-5 cursor-pointer bg-cyan-500"
          onClick={() => handleHighlight(HighlightColorEnum.Cyan)}
        ></button>
        <Button
          variant={'ghost'}
          className="!px-2 !text-xs rounded-lg"
          onClick={async () => {
            const id = await handleHighlight(HighlightColorEnum.Fuchsia)
            const highlight = document.querySelector(
              `[data-highlight-id="${id}"]`
            ) as HTMLButtonElement | null
            if (highlight) {
              highlight.focus()
              highlight.click()
            }
          }}
        >
          <DynamicIcon name="pencil" className="size-4" />
          <p>Add note</p>
        </Button>
      </div>
      {definition && (
        <div className="bg-white border border-morphing-300 shadow-lg shadow-morphing-900/20 mb-2 rounded-xl max-w-sm p-3">
          {definition.loading ? (
            <div className="animate-pulse bg-morphing-100 rounded-md h-4 w-full"></div>
          ) : (
            <DictionaryEntry {...definition} />
          )}
        </div>
      )}
      <div className="bg-gradient-to-tr from-white via-violet-50 to-white border border-violet-300 shadow-lg shadow-violet-900/20 mb-2 rounded-xl max-w-sm p-1 flex items-center flex-wrap w-fit">
        <Button
          variant={'ghost'}
          className="!px-2 !text-xs rounded-lg hover:bg-violet-100 text-violet-900 hover:text-violet-900"
        >
          <DynamicIcon name="bot-message-square" className="size-4" />
          <p>Chat with AI</p>
        </Button>
        <Button
          variant={'ghost'}
          className="!px-2 !text-xs rounded-lg hover:bg-violet-100 text-violet-900 hover:text-violet-900"
        >
          <DynamicIcon name="help-circle" className="size-4" />
          <p>What does this mean?</p>
        </Button>
      </div>
    </SelectionTooltip>
  )
}
