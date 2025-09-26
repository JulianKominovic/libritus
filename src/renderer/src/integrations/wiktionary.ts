import wtf from 'wtf_wikipedia'

type WikipediaOpenSearchResult = [
  // The term you are searching for
  string,
  // The title found
  string[],
  // The descriptions found (they are deprecated)
  string[],
  // The urls found
  string[]
]

export type DictionaryApiResponse = Array<{
  word: string
  origin?: string
  phonetics: Array<{
    audio: string
    sourceUrl?: string
    license?: {
      name: string
      url: string
    }
    text?: string
  }>
  meanings: Array<{
    partOfSpeech: string
    definitions: Array<{
      definition: string
      synonyms: Array<string>
      antonyms: Array<string>
      example?: string
    }>
    synonyms: Array<string>
    antonyms: Array<string>
  }>
  license: {
    name: string
    url: string
  }
  sourceUrls: Array<string>
}>

export type WikipediaDefinition = {
  sentences: string[]
  url: string
  image: string | null
  title: string
}

async function searchWikipedia(
  rawTitle: string,
  signal: AbortSignal
): Promise<WikipediaDefinition | null> {
  // You can point to different languages, just change the subdomain 'en.wikipedia.org' to 'es.wikipedia.org' for example
  // The profile argument can be found here: https://www.mediawiki.org/wiki/API:Opensearch
  const opensearchResult = await fetch(
    `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(
      rawTitle
    )}&limit=1&namespace=0&format=json&profile=classic&origin=*`,
    { signal }
  ).catch((e) => {
    console.error('Error searching Wikipedia', e)
    return null
  })
  if (!opensearchResult?.ok) return null
  const [, titlesFound]: WikipediaOpenSearchResult = await opensearchResult.json()
  const [titleFound] = titlesFound

  let doc = await wtf.fetch(titleFound)
  if (!doc) return null
  if (Array.isArray(doc)) doc = doc[0]
  return {
    title: doc.title() || '',
    sentences: doc
      .sentences()
      .slice(0.5)
      .map((sentence) => sentence.text()),
    url: doc.url() || '',
    image: doc.image()?.src() || null
  }
}

async function searchDictionaryApi(
  rawTitle: string,
  signal: AbortSignal
): Promise<DictionaryApiResponse | null> {
  const dictionaryResult = await fetch(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(rawTitle)}`,
    { signal }
  ).catch((e) => {
    console.error('Error searching Dictionary API', e)
    return null
  })
  if (!dictionaryResult?.ok) return null
  const data: DictionaryApiResponse = await dictionaryResult.json()
  return data
}

export const WikiClient = {
  getDictionaryDefinition: async (
    rawTitle: string,
    signal: AbortSignal
  ): Promise<{
    result: DictionaryApiResponse
    source: 'dictionary'
  } | null> => {
    const dictionaryResult = await searchDictionaryApi(rawTitle, signal)
    if (dictionaryResult) return { result: dictionaryResult, source: 'dictionary' }
    return null
  },
  getWikipediaDefinition: async (
    rawTitle: string,
    signal: AbortSignal
  ): Promise<{ result: WikipediaDefinition; source: 'wikipedia' } | null> => {
    const wikipediaResult = await searchWikipedia(rawTitle, signal)
    if (wikipediaResult) return { result: wikipediaResult, source: 'wikipedia' }
    return null
  }
}
