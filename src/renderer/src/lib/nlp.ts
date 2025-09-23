import winkNLP from 'wink-nlp'
// Load english language model — light version.
import model from 'wink-eng-lite-web-model'

const nlp = winkNLP(model)

/**
 * Return a list of terms that are likely searcheable in wikipedia.
 */
export function getCustomTerms(text: string) {
  const doc = nlp.readDoc(text)
  const potentialEntities = doc.customEntities().out()
  return potentialEntities
}
