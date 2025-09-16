/** biome-ignore-all lint/suspicious/noArrayIndexKey: I know what I'm doing 🔥🚒🧨 */
import { usePDFPageNumber } from "@anaralabs/lector";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { getHightBaseColor } from "@/lib/highlight-colors";
import { type Pdf, usePdfs } from "@/stores/categories";

export default function CustomHighlightLayer({
  highlights,
  setSelectedHighlight,
  selectedHighlight,
  categoryId,
  pdfId,
}: {
  highlights: Pdf["highlights"];
  selectedHighlight: NonNullable<Pdf["highlights"]>[0] | null;
  setSelectedHighlight: (
    highlight: NonNullable<Pdf["highlights"]>[0] | null
  ) => void;
  categoryId: string;
  pdfId: string;
}) {
  const pageNumber = usePDFPageNumber();
  const addCommentToHighlight = usePdfs((s) => s.addCommentToHighlight);
  return highlights
    ?.filter((r) => r.rects.some((re) => re.pageNumber === pageNumber))
    .flatMap((h, idx) =>
      h.rects
        .filter(
          (rect) =>
            rect.left > 0 && rect.top > 0 && rect.pageNumber === pageNumber
        )
        .map((r, i) => {
          const isSelected = h.id === selectedHighlight?.id;
          return (
            <Popover
              open={isSelected}
              onOpenChange={(open) => {
                setSelectedHighlight(open ? h : null);
              }}
              key={idx + r.pageNumber + (h?.id ?? "") + i}
            >
              <PopoverTrigger asChild>
                <button
                  data-highlight-id={h.id}
                  type="button"
                  className="absolute rounded-sm select-none cursor-pointer opacity-30 hover:opacity-50"
                  style={{
                    left: r.left,
                    top: r.top,
                    width: r.width,
                    height: r.height,
                    backgroundColor: isSelected
                      ? "#464646"
                      : getHightBaseColor(h.color),
                  }}
                />
              </PopoverTrigger>
              <PopoverContent asChild className="">
                <form
                  action=""
                  onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.target as HTMLFormElement);
                    const text = (formData.get("text") as string).trim();
                    if (text) {
                      addCommentToHighlight(categoryId, pdfId, h.id, {
                        text,
                        id: crypto.randomUUID(),
                        createdAt: new Date(),
                        updatedAt: new Date(),
                      });
                      setSelectedHighlight(null);
                    }
                  }}
                >
                  <Textarea className="mb-2" name="text" />
                  <Button variant={"default"} type="submit">
                    Save
                  </Button>
                </form>
              </PopoverContent>
            </Popover>
          );
        })
    );
}
