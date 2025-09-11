import chroma from "chroma-js";
import { PlusIcon } from "lucide-react";
import { useLayoutEffect } from "react";
import { useDebounceCallback } from "usehooks-ts";
import { Link, Redirect, useParams } from "wouter";
import { resetGlobalTheme, setGlobalTheme } from "@/lib/app-theme";
import { createColorPalette } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { usePdfs } from "@/stores/categories";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { IconPicker } from "@/components/ui/icon-picker";
import { DynamicIcon } from "lucide-react/dynamic";
const DEBOUNCE_TIME = 300;

function Category() {
  const { categoryId } = useParams();

  const categories = usePdfs((p) => p.categories);
  const updateCategory = usePdfs((p) => p.updateCategory);
  const updateTitle = useDebounceCallback((title: string) => {
    updateCategory(categoryId || "", {
      name: title,
    });
  }, DEBOUNCE_TIME);
  const updateDescription = useDebounceCallback((description: string) => {
    updateCategory(categoryId || "", { description });
  }, DEBOUNCE_TIME);
  const updateColor = useDebounceCallback((color: string) => {
    const hex = chroma(color).hex();
    updateCategory(categoryId || "", { color: hex });
    const palette = createColorPalette(hex);
    console.log(palette);
  }, DEBOUNCE_TIME);
  const uploadPdf = usePdfs((p) => p.uploadPdf);
  const category = categories.find((c) => c.id === categoryId);

  useLayoutEffect(() => {
    setGlobalTheme(createColorPalette(category?.color || "#555"));
    return () => {
      resetGlobalTheme();
    };
  }, [category?.color]);

  if (!category || !categoryId) {
    return <Redirect to="/" />;
  }

  const isDefault = categoryId === "default";

  return (
    <>
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "cursor-pointer size-8 rounded-[50%] overflow-hidden aspect-square border-morphing-600 border transition-transform flex-shrink-0",
            isDefault ? "" : "hover:scale-110"
          )}
        >
          <input
            key={`color-${categoryId}`}
            disabled={isDefault}
            readOnly={isDefault}
            type="color"
            name="color"
            id={`color-${categoryId}`}
            className={cn("size-full")}
            defaultValue={category.color}
            onChange={(e) => updateColor(e.target.value)}
          />
        </div>
        {isDefault ? null : (
          <IconPicker
            className="size-8 flex-shrink-0"
            defaultValue={category.icon}
            onValueChange={(icon) => updateCategory(categoryId, { icon })}
          >
            <DynamicIcon name={category.icon} size={24} />
          </IconPicker>
        )}

        <input
          key={`name-${categoryId}`}
          disabled={isDefault}
          className={cn(
            isDefault ? "cursor-default" : "cursor-text",
            "text-5xl font-semibold font-serif w-full block focus:outline-0 min-w-40 text-morphing-900"
          )}
          defaultValue={category.name}
          onChange={(e) => updateTitle(e.target.value)}
          readOnly={isDefault}
        />
      </div>
      <textarea
        key={`description-${categoryId}`}
        disabled={isDefault}
        className={cn(
          isDefault ? "cursor-default" : "cursor-text",
          "text-lg text-morphing-700 w-full block focus:outline-0 max-w-md min-w-40 resize-none"
        )}
        defaultValue={category.description}
        onChange={(e) => updateDescription(e.target.value)}
        readOnly={isDefault}
        rows={3}
      />
      <h2 className="text-sm text- mb-6">{category.pdfs.length} pdfs</h2>
      <div className="flex flex-wrap gap-8 group/container">
        {category.pdfs.map((pdf) => (
          <HoverCard openDelay={100} closeDelay={100} key={pdf.id}>
            <HoverCardTrigger asChild>
              <Link
                to={`/category/${categoryId}/${pdf.id}`}
                className="p-0 flex flex-col justify-center items-center h-80 w-56 object-contain bg-morphing-100 relative group pdf-card-content [--radius:16px] hover:drop-shadow-xl hover:scale-105 duration-300 transition-all drop-shadow-morphing-900/20 group"
              >
                <img
                  src={pdf.thumbnail || ""}
                  alt={pdf.name}
                  className="size-full object-cover"
                />
              </Link>
            </HoverCardTrigger>
            <HoverCardContent side="right" sideOffset={12}>
              The React Framework – created and maintained by @vercel.
            </HoverCardContent>
          </HoverCard>
        ))}
        <label
          htmlFor={`pdf-upload-${categoryId}`}
          className="border-morphing-200 p-4 flex flex-col justify-center items-center rounded-xl border h-80 w-52 bg-morphing-100 hover:bg-morphing-200 transition-colors"
        >
          <PlusIcon className="size-10 text-morphing-600" />
          <p className="text-morphing-800 text-lg font-medium">Upload a PDF</p>
          <p className="text-sm text-morphing-800">or drop it here</p>
          <input
            id={`pdf-upload-${categoryId}`}
            type="file"
            placeholder="Upload a PDF"
            accept="application/pdf"
            hidden
            onChange={(e) => {
              const file = e.target.files?.item(0);
              if (file && file.type === "application/pdf") {
                uploadPdf(categoryId, file);
              }
            }}
          />
        </label>
      </div>
    </>
  );
}

export default Category;
