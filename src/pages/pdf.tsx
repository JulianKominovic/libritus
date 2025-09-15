import {
  AnnotationLayer,
  CanvasLayer,
  CurrentPage,
  CurrentZoom,
  Outline,
  OutlineChildItems,
  OutlineItem,
  Page,
  Pages,
  Root,
  TextLayer,
  TotalPages,
  usePdf,
  useSelectionDimensions,
  ZoomIn,
  ZoomOut,
} from "@anaralabs/lector";
import { DynamicIcon } from "lucide-react/dynamic";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Redirect, useParams } from "wouter";
import {
  Tabs,
  TabsContent,
  TabsContents,
  TabsList,
  TabsTrigger,
} from "@/components/animate-ui/components/animate/tabs";
import { Button, buttonVariants } from "@/components/ui/button";
import Shortcut from "@/components/ui/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { resetGlobalTheme, setGlobalTheme } from "@/lib/app-theme";
import { createColorPalette } from "@/lib/colors";
import { Keys } from "@/lib/keymaps";
import { cn } from "@/lib/utils";
import { usePdfs } from "@/stores/categories";
import { useSettings } from "@/stores/settings";
import { useDebounceCallback } from "usehooks-ts";
import {
  DictionaryApiResponse,
  WikiClient,
  WikipediaDefinition,
} from "@/integrations/wiktionary";
import { openUrl } from "@tauri-apps/plugin-opener";
import { checkSelectionSource } from "@/lib/dom";
import { SelectionTooltip } from "@/components/pdf/selection-tooltip";

function ZoomFitWidth(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const zoomFitWidth = usePdf((s) => s.zoomFitWidth);
  return (
    <button
      {...props}
      className="p-0 size-6 flex items-center justify-center"
      onClick={zoomFitWidth}
    >
      <DynamicIcon name="maximize-2" className="size-4" />
    </button>
  );
}

function PercentageProgress() {
  const currentPage = usePdf((s) => s.currentPage);
  const numPages = usePdf((state) => state.pdfDocumentProxy.numPages);
  const percentage = useMemo(() => {
    return (currentPage / numPages) * 100;
  }, [currentPage, numPages]);
  return (
    <div className="text-morphing-700 text-sm tabular-nums">
      {percentage.toFixed(1)}%
    </div>
  );
}

function CustomOutline() {
  return (
    <Tabs className="w-full h-full min-h-0 px-4" defaultValue="highlights">
      <TabsList className="w-full px-1">
        <TabsTrigger value="highlights">
          <DynamicIcon name="highlighter" className="size-4" />
        </TabsTrigger>
        <TabsTrigger value="annotations">
          <DynamicIcon name="pen-line" className="size-4" />
        </TabsTrigger>
        <TabsTrigger value="chats">
          <DynamicIcon name="bot-message-square" className="size-4" />
        </TabsTrigger>
        <TabsTrigger value="q&a">
          <DynamicIcon name="help-circle" className="size-4" />
        </TabsTrigger>
        <TabsTrigger value="outline">
          <DynamicIcon name="list" className="size-4" />
        </TabsTrigger>
      </TabsList>
      <TabsContents wrapperClassName="h-full">
        <TabsContent value="highlights">highlights.</TabsContent>
        <TabsContent value="annotations">annotations.</TabsContent>
        <TabsContent value="chats">chats.</TabsContent>
        <TabsContent value="q&a">q&a.</TabsContent>
        <TabsContent value="outline" className="h-full">
          <Outline
            className={cn(
              "[&__ul]:pl-8 space-y-1 [&__li]:mb-1 [&__li]:text-sm [&__a]:text-morphing-700 [&__a]:cursor-pointer [&__a:hover]:text-morphing-900 select-none w-full h-full pb-20 overflow-y-auto px-4"
            )}
          >
            <OutlineItem>
              <OutlineChildItems />
            </OutlineItem>
          </Outline>
        </TabsContent>
      </TabsContents>
    </Tabs>
  );
}

type DefinitionState =
  | {
      text: string;
      source: "wikipedia";
      definition: WikipediaDefinition;
      loading: boolean;
    }
  | {
      text: string;
      source: "dictionary";
      definition: DictionaryApiResponse;
      loading: boolean;
    };

function DictionaryEntry({
  text,
  definition,
  source,
  loading,
}: DefinitionState) {
  console.log({
    text,
    definition,
    source,
    loading,
  });
  const phonetic =
    source === "dictionary" && definition[0].phonetics.find((p) => p.audio);
  const flatDictionaryDefinition =
    source === "dictionary" &&
    definition.flatMap((d) => {
      return d.meanings.flatMap((m) => {
        return m.definitions.map((d) => {
          return {
            ...d,
            partOfSpeech: m.partOfSpeech,
          };
        });
      });
    });
  return (
    <div className="max-w-sm">
      <h4 className="text-morphing-900 font-semibold mb-1">
        {source === "wikipedia" && definition.url ? (
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
                e.preventDefault();
                e.stopPropagation();
                openUrl(definition.url);
              }}
              href={definition.url}
              target="_blank"
              className="flex items-center gap-1"
            >
              {definition.title ||
                text.charAt(0).toLocaleUpperCase() +
                  text.slice(1).toLocaleLowerCase()}{" "}
              <DynamicIcon name="external-link" className="size-4" />
            </a>
          </>
        ) : (
          text.charAt(0).toLocaleUpperCase() + text.slice(1).toLocaleLowerCase()
        )}
      </h4>
      {source === "wikipedia" ? (
        <ul className="list-disc list-inside mb-2 space-y-1.5">
          {definition.sentences.slice(0, 3).map((definition, i) => (
            <li
              key={"definition-" + i}
              className="text-morphing-700 line-clamp-4 text-sm list-item list-inside list-disc"
            >
              {definition}
            </li>
          ))}
        </ul>
      ) : source === "dictionary" && flatDictionaryDefinition ? (
        <ul className="list-disc list-inside mb-2 space-y-1.5">
          {flatDictionaryDefinition.map((meaning, i) => (
            <li
              key={"meaning-" + i}
              className="text-morphing-800 line-clamp-4 text-sm list-item list-inside list-disc"
            >
              <u>{meaning.partOfSpeech}</u> {meaning.definition}
              {meaning.example && (
                <p className="text-morphing-700 text-xs">{meaning.example}</p>
              )}
              {meaning.synonyms.length > 0 && (
                <p className="text-green-700 text-xs">
                  Synonyms: {Array.from(new Set(meaning.synonyms)).join(", ")}
                </p>
              )}
              {meaning.antonyms.length > 0 && (
                <p className="text-red-700 text-xs">
                  Antonyms: {Array.from(new Set(meaning.antonyms)).join(", ")}
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {source === "dictionary" && phonetic && (
        <audio src={phonetic.audio} controls></audio>
      )}
      {source === "wikipedia" ? (
        <small className="text-morphing-700 text-xs">
          Search can be inaccurate. Extracted from{" "}
          <a
            href={"https://wikipedia.org/"}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openUrl("https://wikipedia.org/");
            }}
            target="_blank"
            className="flex items-center gap-1 underline"
          >
            Wikipedia
          </a>
        </small>
      ) : (
        <small className="text-morphing-700 text-xs">
          Search can be inaccurate. Extracted from{" "}
          <a
            href={"https://dictionaryapi.dev/"}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openUrl("https://dictionaryapi.dev/");
            }}
            target="_blank"
            className="flex items-center gap-1 underline"
          >
            Dictionary API
          </a>
        </small>
      )}
    </div>
  );
}

export function SelectionMenu() {
  const selectionDimensions = useSelectionDimensions();
  const [definition, setDefinition] = useState<DefinitionState | null>(null);
  const [] = useState<"add-note" | "chat-with-ai" | "what-does-this-mean">(
    "add-note"
  );
  const abortController = useRef<AbortController | null>(null);
  const debouncedFetchDefinition = useDebounceCallback(async (word: string) => {
    abortController.current?.abort();
    abortController.current = new AbortController();
    const { signal } = abortController.current;

    try {
      console.log("Fetching definition for", word);
      const dictionaryResult = await WikiClient.getDictionaryDefinition(
        word,
        signal
      );
      if (dictionaryResult) {
        return setDefinition({
          text: word,
          definition: dictionaryResult.result,
          source: "dictionary",
          loading: false,
        });
      }
      const wikipediaResult = await WikiClient.getWikipediaDefinition(
        word,
        signal
      );
      if (wikipediaResult) {
        return setDefinition({
          text: word,
          definition: wikipediaResult.result,
          source: "wikipedia",
          loading: false,
        });
      }
      setDefinition(null);
    } catch (error) {
      console.error("Error fetching definition", error);
      setDefinition(null);
    }
  }, 1000);

  // const handleHighlight = (color: string) => {
  //   const dimension = selectionDimensions.getDimension();
  //   if (dimension && !dimension.isCollapsed) {
  //     const filteredHighlightRects = dimension.highlights.filter(
  //       (rect) => rect.left > 0 && rect.top > 0
  //     );
  //     // onHighlight({
  //     // 	text: dimension.text,
  //     // 	rects: filteredHighlightRects,
  //     // 	comments: [],
  //     // });
  //     window.getSelection()?.removeAllRanges();
  //   }
  // };

  useEffect(() => {
    function handleSelectionChange() {
      const comesFromPdfPage = checkSelectionSource(
        window.getSelection(),
        "[data-pdf-page]"
      );
      abortController.current?.abort();
      abortController.current = new AbortController();
      setDefinition(null);
      const text = selectionDimensions.getDimension()?.text;
      if (comesFromPdfPage && text && text.length < 40) {
        setDefinition({
          text,
          source: "wikipedia",
          definition: {
            sentences: [],
            url: "",
            image: null,
            title: "",
          },
          loading: true,
        });
        debouncedFetchDefinition(text);
      }
    }
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, []);

  return (
    <SelectionTooltip>
      <div className="bg-white border border-morphing-300 shadow-lg shadow-morphing-900/20 mb-2 rounded-xl text-sm max-w-sm p-1 flex items-center gap-2 flex-wrap w-fit pl-3">
        <button className="rounded-[50%] size-5 cursor-pointer bg-fuchsia-500"></button>
        <button className="rounded-[50%] size-5 cursor-pointer bg-lime-500"></button>
        <button className="rounded-[50%] size-5 cursor-pointer bg-cyan-500"></button>
        <Button variant={"ghost"} className="!px-2 !text-xs rounded-lg">
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
          variant={"ghost"}
          className="!px-2 !text-xs rounded-lg hover:bg-violet-100 text-violet-900 hover:text-violet-900"
        >
          <DynamicIcon name="bot-message-square" className="size-4" />
          <p>Chat with AI</p>
        </Button>
        <Button
          variant={"ghost"}
          className="!px-2 !text-xs rounded-lg hover:bg-violet-100 text-violet-900 hover:text-violet-900"
        >
          <DynamicIcon name="help-circle" className="size-4" />
          <p>What does this mean?</p>
        </Button>
      </div>
    </SelectionTooltip>
  );
}

function AttachListeners() {
  const updateZoom = usePdf((s) => s.updateZoom);
  const zoomFitWidth = usePdf((s) => s.zoomFitWidth);
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey) {
        switch (e.key) {
          case "+":
            e.preventDefault();
            e.stopPropagation();
            updateZoom((prev) => prev + 0.05);
            break;
          case "-":
            e.preventDefault();
            e.stopPropagation();
            updateZoom((prev) => prev - 0.05);
            break;
          case "0":
            e.preventDefault();
            e.stopPropagation();
            zoomFitWidth();
            break;
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [updateZoom, zoomFitWidth]);
  return null;
}

function PdfPage() {
  const { categoryId, pdfId } = useParams();
  const pdfs = usePdfs((p) => p.categories);
  const pdf = pdfs
    .find((c) => c.id === categoryId)
    ?.pdfs.find((p) => p.id === pdfId);
  const showPdfOutline = useSettings((s) => s.showPdfOutline);
  useLayoutEffect(() => {
    setGlobalTheme(createColorPalette(pdf?.hexColor || "#555"));
    return () => {
      resetGlobalTheme();
    };
  }, [pdf?.hexColor]);

  if (!pdf) {
    return <Redirect to="/" />;
  }
  return (
    <div
      className={
        "px-0 w-full h-[calc(100%-50px)] overflow-y-auto overflow-x-hidden relative"
      }
      key={pdfId}
    >
      <Root
        // Buggy as af don't use it
        // isZoomFitWidth
        source={pdf.src}
        className={cn(
          "w-full h-full overflow-hidden select-auto gap-4 grid",
          showPdfOutline ? "grid-cols-[1fr_300px]" : "grid-cols-1"
        )}
        loader={
          <div className="p-4 max-w-sm w-full mx-auto">
            <img
              src={pdf?.thumbnail}
              alt={pdf?.name}
              className="h-auto w-full mb-4 object-cover rounded-md"
            />
            <p className="text-lg text-morphing-700 font-medium text-center mb-2">
              Loading PDF...
            </p>
            <DynamicIcon
              name="loader-2"
              className="size-8 animate-spin text-morphing-700 mx-auto"
            />
          </div>
        }
      >
        <Pages className="h-full">
          <Page data-pdf-page>
            <CanvasLayer background={"transparent"} />
            <TextLayer />
            <AnnotationLayer />
          </Page>
        </Pages>
        <SelectionMenu />
        {showPdfOutline && <CustomOutline />}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center justify-center gap-2">
          <div className="flex gap-2 p-2 bg-morphing-100 border border-morphing-300 shadow-md shadow-morphing-900/20 rounded-full">
            <PercentageProgress />
          </div>
          <div className="flex gap-2 p-2 bg-morphing-100 border border-morphing-300 shadow-md shadow-morphing-900/20 rounded-full">
            <CurrentPage className="text-end w-fit focus:outline-none tabular-nums" />{" "}
            <span className="text-morphing-700">of</span> <TotalPages />
          </div>
          <div className="flex gap-2 p-2 bg-morphing-100 border border-morphing-300 shadow-md shadow-morphing-900/20 rounded-full">
            <Tooltip>
              <TooltipTrigger asChild>
                <ZoomOut
                  className={buttonVariants({
                    variant: "none",
                    className: "!p-0 !size-6",
                  })}
                >
                  <DynamicIcon name="zoom-out" className="size-4" />
                </ZoomOut>
              </TooltipTrigger>
              <TooltipContent>
                Zoom out{" "}
                <Shortcut
                  keys={[Keys.CONTROL_OR_META, "-"]}
                  className="ml-1 border border-white rounded-sm px-1"
                />
              </TooltipContent>
            </Tooltip>

            <CurrentZoom className="w-8 focus:outline-none tabular-nums" />
            <Tooltip>
              <TooltipTrigger asChild>
                <ZoomIn
                  className={buttonVariants({
                    variant: "none",
                    className: "!p-0 !size-6",
                  })}
                >
                  <DynamicIcon name="zoom-in" className="size-4" />
                </ZoomIn>
              </TooltipTrigger>
              <TooltipContent>
                Zoom in{" "}
                <Shortcut
                  keys={[Keys.CONTROL_OR_META, "+"]}
                  className="ml-1 border border-white rounded-sm px-1"
                />
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <ZoomFitWidth />
              </TooltipTrigger>
              <TooltipContent>
                Zoom to fit width{" "}
                <Shortcut
                  keys={[Keys.CONTROL_OR_META, "0"]}
                  className="ml-1 border border-white rounded-sm px-1"
                />
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
        <AttachListeners />
      </Root>
    </div>
  );
}

export default PdfPage;
