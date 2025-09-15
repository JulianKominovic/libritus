import { join } from "@tauri-apps/api/path";
import Database from "@tauri-apps/plugin-sql";
import { WORKDIR } from "@/stores/settings";

// when using `"withGlobalTauri": true`, you may use
// const Database = window.__TAURI__.sql;
const dictionaryDbPath = await join(WORKDIR, "dictionary-en.db");
const dictionaryDb = await Database.load(`sqlite:${dictionaryDbPath}`);

type DictionaryEntry = {
  word: string;
  wordType: string;
  definition: string;
};

export const DictionaryDb = {
  findByWord: async (title: string): Promise<string[]> => {
    let result = (await dictionaryDb.select(
      "SELECT * FROM entries WHERE word LIKE $1;",
      [title]
    )) as DictionaryEntry[];
    if (result.length === 0) {
      // Maybe it's a plural word, try the singular form
      result = await dictionaryDb.select(
        "SELECT * FROM entries WHERE word LIKE $1;",
        [title.replace(/s$/, "")]
      );
      if (result.length === 0) {
        return [];
      }
    }

    const [definitionFound, ...restOfDefinitions] = result as DictionaryEntry[];

    if (!definitionFound) return [];

    // If the definition says 'of ...', resolve it to 'of ... ' + definition
    let expandedDefinition = definitionFound.definition;
    if (definitionFound.definition.startsWith("of ")) {
      const ofWord = definitionFound.definition
        .replace("of ", "")
        .toLowerCase();
      const ofDefinitionResult = await dictionaryDb.select(
        "SELECT * FROM entries WHERE word LIKE $1 LIMIT 1;",
        [ofWord]
      );
      if (Array.isArray(ofDefinitionResult)) {
        const [ofDefinition] = ofDefinitionResult as {
          word: string;
          wordType: string;
          definition: string;
        }[];
        if (ofDefinition) {
          expandedDefinition += ". " + ofDefinition.definition;
        }
      }
    }

    return [
      expandedDefinition,
      ...restOfDefinitions
        .map((d) => d.definition)
        .filter((d) => !/^of .*$/i.test(d)),
    ];
  },
};
