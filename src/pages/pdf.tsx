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
  ZoomIn,
  ZoomOut,
  usePdf,
} from "@anaralabs/lector";
import { DynamicIcon } from "lucide-react/dynamic";
import { useEffect, useLayoutEffect, useMemo } from "react";
import { Redirect, useParams } from "wouter";
import { resetGlobalTheme, setGlobalTheme } from "@/lib/app-theme";
import { createColorPalette } from "@/lib/colors";
import { usePdfs } from "@/stores/categories";
import { buttonVariants } from "@/components/ui/button";
import { useSettings } from "@/stores/settings";
import { cn } from "@/lib/utils";
import {
  Tabs,
  TabsContent,
  TabsContents,
  TabsList,
  TabsTrigger,
} from "@/components/animate-ui/components/animate/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import Shortcut from "@/components/ui/kbd";
import { Keys } from "@/lib/keymaps";

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
    <Tabs className="w-full h-full min-h-0 pr-6" defaultValue="annotations">
      <TabsList className="w-full px-1.5">
        <TabsTrigger value="highlights">
          <DynamicIcon name="highlighter" className="size-4" />
        </TabsTrigger>
        <TabsTrigger value="annotations">
          <DynamicIcon name="pen-line" className="size-4" />
        </TabsTrigger>
        <TabsTrigger value="outline">
          <DynamicIcon name="list" className="size-4" />
        </TabsTrigger>
      </TabsList>
      <TabsContents className="!overflow-y-auto">
        <TabsContent value="highlights">highlights.</TabsContent>
        <TabsContent value="annotations">annotations.</TabsContent>
        <TabsContent value="outline">
          <Outline
            className={cn(
              "[&__ul]:pl-8 space-y-1 [&__li]:mb-1 [&__li]:text-sm [&__a]:text-morphing-700 [&__a]:cursor-pointer [&__a:hover]:text-morphing-900 select-none w-full h-full pb-20"
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
  }, []);
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
        isZoomFitWidth
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
        <Pages className="p-4 h-full">
          <Page>
            <CanvasLayer background={"transparent"} />
            <TextLayer />
            <AnnotationLayer />
          </Page>
        </Pages>
        {showPdfOutline && <CustomOutline />}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center justify-center gap-2">
          <div className="flex gap-2 p-2 bg-morphing-100 border border-morphing-200 shadow-md shadow-morphing-900/10 rounded-full">
            <PercentageProgress />
          </div>
          <div className="flex gap-2 p-2 bg-morphing-100 border border-morphing-200 shadow-md shadow-morphing-900/10 rounded-full">
            <CurrentPage className="text-end w-fit focus:outline-none tabular-nums" />{" "}
            <span className="text-morphing-700">of</span> <TotalPages />
          </div>
          <div className="flex gap-2 p-2 bg-morphing-100 border border-morphing-200 shadow-md shadow-morphing-900/10 rounded-full">
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
