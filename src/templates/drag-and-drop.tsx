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
  const delayedSetDragging = useDebounceCallback(setDragging, 5000);
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
      onDrop={async (e) => {
        e.preventDefault();
        let validFiles = 0;
        for (const file of e.dataTransfer.files) {
          if (file.type === "application/pdf") {
            validFiles++;
            await uploadPdf(safeCategoryId, file);
          }
        }

        if (validFiles > 0 && validFiles !== e.dataTransfer.files.length) {
          setDragging(false);
          setDraggingValidFile(true);
        } else {
          setDraggingValidFile(false);
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
                : "border-destructive/60"
            )}
          >
            <h2
              className={cn(
                "text-2xl font-bold mb-4 text-center font-serif",
                draggingValidFile ? "text-morphing-800" : "text-destructive"
              )}
            >
              {draggingValidFile
                ? "Drop the PDF here"
                : "One or more files are not PDFs"}
            </h2>
            <p
              className={cn(
                "text-muted-foreground text-center",
                draggingValidFile ? "text-morphing-500" : "text-destructive"
              )}
            >
              {draggingValidFile
                ? "Drop the PDF here to upload it."
                : "One or more files are not PDFs. Those files will not be uploaded."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DragAndDropZone;
