import {
  AnnotationLayer,
  CanvasLayer,
  CurrentPage,
  CurrentZoom,
  Page,
  Pages,
  Root,
  TextLayer,
  TotalPages,
  ZoomIn,
  ZoomOut,
} from "@anaralabs/lector";
import { DynamicIcon } from "lucide-react/dynamic";
import { useLayoutEffect } from "react";
import { Redirect, useParams } from "wouter";
import { resetGlobalTheme, setGlobalTheme } from "@/lib/app-theme";
import { createColorPalette } from "@/lib/colors";
import { usePdfs } from "@/stores/categories";

function PdfPage() {
  const { categoryId, pdfId } = useParams();
  const pdfs = usePdfs((p) => p.categories);
  const pdf = pdfs
    .find((c) => c.id === categoryId)
    ?.pdfs.find((p) => p.id === pdfId);
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
    <div className="px-4 w-full h-full overflow-y-auto" key={pdfId}>
      <Root
        source={pdf.src}
        className="w-full h-full overflow-hidden select-auto max-w-3xl mx-auto"
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
        <div className="flex gap-2 p-2">
          <ZoomOut />
          <CurrentZoom />
          <ZoomIn />
          <CurrentPage /> of <TotalPages />
        </div>
        <Pages className="p-4 h-full">
          <Page>
            <CanvasLayer background={"transparent"} />
            <TextLayer />
            <AnnotationLayer />
          </Page>
        </Pages>
      </Root>
    </div>
  );
}

export default PdfPage;
