/** biome-ignore-all lint/a11y/noStaticElementInteractions: <explanation> */

import { useState } from "react";
import { useDebounceCallback } from "usehooks-ts";
import { useParams } from "wouter";
import { cn } from "@/lib/utils";
import { usePdfs } from "@/stores/categories";

function DragAndDropZone({
  children,
  forceCategoryId,
  ...props
}: {
  children: React.ReactNode;
  forceCategoryId?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  const { categoryId } = useParams<{ categoryId: string | undefined }>();
  const safeCategoryId = forceCategoryId || categoryId || "default";
  const uploadPdf = usePdfs((p) => p.uploadPdf);
  const [dragging, setDragging] = useState(false);
  const [draggingValidFile, setDraggingValidFile] = useState(true);
  const delayedSetDragging = useDebounceCallback(setDragging, 2000);
  return (
    <div
      onDragStart={() => setDragging(true)}
      onDragEnd={() => setDragging(false)}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
        setDraggingValidFile(true);
      }}
      onDragLeave={() => {
        setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        const isValidFile =
          e.dataTransfer.files.length > 0 &&
          e.dataTransfer.files.item(0)?.type === "application/pdf";
        const file = e.dataTransfer.files.item(0);
        setDraggingValidFile(isValidFile);
        if (isValidFile && file) {
          uploadPdf(safeCategoryId, file);
          setDragging(false);
        } else {
          delayedSetDragging(false);
        }
      }}
      {...props}
    >
      {children}
      <div
        className={cn(
          "fixed inset-0 bg-black/10 backdrop-blur-lg w-full h-full",
          dragging
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        )}
      >
        <div className="flex items-center justify-center h-full">
          <div
            className={cn(
              "bg-white max-w-md w-full p-8 rounded-xl border",
              draggingValidFile
                ? "border-morphing-200"
                : "border-destructive/60 bg-destructive/10"
            )}
          >
            <h2
              className={cn(
                "text-2xl font-bold mb-4 text-center font-serif",
                draggingValidFile ? "text-morphing-800" : "text-destructive"
              )}
            >
              {draggingValidFile ? "Drop the PDF here" : "Invalid file type"}
            </h2>
            <p
              className={cn(
                "text-muted-foreground text-center",
                draggingValidFile ? "text-morphing-500" : "text-destructive"
              )}
            >
              {draggingValidFile
                ? "Drop the PDF here to upload it."
                : "That file is not a PDF."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DragAndDropZone;
