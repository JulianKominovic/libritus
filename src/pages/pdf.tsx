import {
  AnnotationLayer,
  CanvasLayer,
  Outline,
  OutlineChildItems,
  OutlineItem,
  Page,
  Pages,
  Root,
  TextLayer,
  usePdf,
} from "@anaralabs/lector";
import { DynamicIcon } from "lucide-react/dynamic";
import { useEffect, useRef, useState } from "react";
import { Redirect, useParams } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDebounceFunction } from "@/hooks/use-debounce-function";
import { cn } from "@/lib/utils";
import CustomHighlightLayer from "@/organisms/pdf/custom-highlight-layer";
import HighlightCardsTemplate from "@/organisms/pdf/highlight-card";
import { type Pdf, usePdfs } from "@/stores/categories";
import { useSettings } from "@/stores/settings";
import FloatingControls from "@/templates/pdf/floating-controls";
import SelectionMenu from "@/templates/pdf/text-selection-menu";

function CustomOutline({
  selectedHighlight,
  highlights,
  categoryId,
  pdfId,
  setSelectedHighlight,
}: {
  selectedHighlight: NonNullable<Pdf["highlights"]>[0] | null;
  highlights: Pdf["highlights"];
  categoryId: string;
  pdfId: string;
  setSelectedHighlight: (
    highlight: NonNullable<Pdf["highlights"]>[0] | null
  ) => void;
}) {
  const highlightTabRef = useRef<HTMLDivElement>(null);
  return (
    <Tabs
      className="w-full h-full min-h-0 px-4 overscroll-contain"
      defaultValue="highlights"
    >
      <TabsList className="w-full px-1">
        <TabsTrigger value="highlights">
          <DynamicIcon name="highlighter" className="size-4" />
        </TabsTrigger>
        <TabsTrigger value="chats">
          <DynamicIcon name="bot-message-square" className="size-4" />
        </TabsTrigger>
        <TabsTrigger value="outline">
          <DynamicIcon name="list" className="size-4" />
        </TabsTrigger>
      </TabsList>

      <TabsContent
        ref={highlightTabRef}
        value="highlights"
        className="h-full !overflow-y-auto overflow-x-visible py-4"
      >
        <HighlightCardsTemplate
          highlights={highlights}
          categoryId={categoryId}
          pdfId={pdfId}
          selectedHighlight={selectedHighlight}
          setSelectedHighlight={setSelectedHighlight}
          tabRef={highlightTabRef}
        />
      </TabsContent>
      <TabsContent value="chats">chats.</TabsContent>
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
    </Tabs>
  );
}

function AttachListeners({
  categoryId,
  pdfId,
  pdf,
}: {
  categoryId: string;
  pdfId: string;
  pdf: Pdf;
}) {
  const updateZoom = usePdf((s) => s.updateZoom);
  const zoomFitWidth = usePdf((s) => s.zoomFitWidth);
  const zoom = usePdf((s) => s.zoom);
  const isZoomFitWidth = usePdf((s) => s.isZoomFitWidth);
  const updatePdf = usePdfs((s) => s.updatePdf);
  const currentPage = usePdf((s) => s.currentPage);
  const numPages = usePdf((s) => s.pdfDocumentProxy.numPages);

  // biome-ignore lint/correctness/useExhaustiveDependencies: No need to add all dependencies
  useEffect(() => {
    updatePdf(categoryId, pdfId, {
      zoom,
      progress: {
        ...pdf.progress,
        percentage: Math.round((currentPage / numPages) * 100),
        pages: currentPage,
      },
      isZoomFitWidth,
    });
  }, [isZoomFitWidth, zoom, currentPage]);

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
  const lastOffset = useRef<number>(pdf?.progress.offset || 0);
  const updatePdf = usePdfs((s) => s.updatePdf);
  const [selectedHighlight, setSelectedHighlight] = useState<
    NonNullable<Pdf["highlights"]>[0] | null
  >(null);
  const { debounce: debouncedUpdatePdfProgress } = useDebounceFunction(1000);

  const showPdfOutline = useSettings((s) => s.showPdfOutline);
  // useLayoutEffect(() => {
  //   setGlobalTheme(createColorPalette(pdf?.hexColor || "#555"));
  //   return () => {
  //     resetGlobalTheme();
  //   };
  // }, [pdf?.hexColor]);

  if (!pdf || !categoryId || !pdfId) {
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
        isZoomFitWidth={pdf.isZoomFitWidth}
        zoom={pdf.zoom}
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
        <Pages
          className="h-full"
          onOffsetChange={(offset) => {
            if (offset === lastOffset.current) return;
            debouncedUpdatePdfProgress(() => {
              updatePdf(categoryId, pdfId, {
                progress: {
                  ...pdf.progress,
                  offset,
                },
              });
            });
            lastOffset.current = offset;
          }}
          initialOffset={pdf.progress.offset}
        >
          <Page data-pdf-page>
            <CanvasLayer background={"transparent"} />
            <TextLayer className="bg-morphing-50 mix-blend-multiply" />
            <AnnotationLayer />
            <CustomHighlightLayer
              highlights={pdf.highlights}
              selectedHighlight={selectedHighlight}
              setSelectedHighlight={setSelectedHighlight}
              categoryId={categoryId}
              pdfId={pdfId}
            />
          </Page>
        </Pages>
        <SelectionMenu categoryId={categoryId} pdfId={pdfId} />
        {showPdfOutline && (
          <CustomOutline
            selectedHighlight={selectedHighlight}
            highlights={pdf.highlights}
            categoryId={categoryId}
            pdfId={pdfId}
            setSelectedHighlight={setSelectedHighlight}
          />
        )}
        <FloatingControls />
        <AttachListeners categoryId={categoryId} pdfId={pdfId} pdf={pdf} />
      </Root>
    </div>
  );
}

export default PdfPage;
