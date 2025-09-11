import type { IconName } from "lucide-react/dynamic";
import { create } from "zustand";
import { readFile, writeFile } from "@/integrations/fs";
import { getPdfMetadata } from "@/lib/pdf";

export type Pdf = {
  id: string;
  name: string;
  filename: string;
  src: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  pages: number;
  thumbnail: string;
  author: string;
  hexColor: string;
  /**
   * The date the PDF was created
   */
  creationDate: Date | null;
  /**
   * The date the PDF was last modified
   */
  modificationDate: Date | null;
  progress: {
    /**
     * 0-100
     */
    percentage: number;
    pages: number;
  };
};
export type Category = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  icon: IconName;
  // HEX COLOR
  color: string;
  pdfs: Pdf[];
};

export type PdfsStore = {
  categories: Category[];
  createCategory: () => Promise<Category>;
  setCategories: (categories: PdfsStore["categories"]) => Promise<void>;
  load: () => Promise<void>;
  uploadPdf: (categoryId: string, data: File) => Promise<Pdf>;
  updateCategory: (
    categoryId: string,
    category: Partial<Category>
  ) => Promise<void>;
  deleteCategory: (categoryId: string) => Promise<void>;
};

export const usePdfs = create<PdfsStore>((set, get) => ({
  categories: [],
  createCategory: async () => {
    const id = crypto.randomUUID();
    const category: Category = {
      id,
      name: "New Category",
      description: "New Category",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      icon: "badge-help",
      color: "#f0aa46",
      pdfs: [],
    };
    await get().setCategories([...get().categories, category]);
    return category;
  },
  load: async () => {
    const categories = await readFile("categories.json");
    console.log(categories);
    if (categories) {
      try {
        const parsedFile = JSON.parse(new TextDecoder().decode(categories));
        console.log("Loaded categories", parsedFile);
        set({ categories: parsedFile });
      } catch (err) {
        console.log("Error loading categories", err);
      }
    } else {
      get().setCategories([
        {
          name: "Uncategorized",
          description:
            "PDFs will be automatically added to this category if they are not added to any other category.",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          id: "default",
          icon: "circle-dot",
          color: "#555",
          pdfs: [],
        },
      ]);
    }
  },
  setCategories: async (categories) => {
    await writeFile(
      "categories.json",
      new TextEncoder().encode(JSON.stringify(categories))
    );
    set({ categories });
  },
  uploadPdf: async (categoryId = "default", data: File) => {
    if (data.type !== "application/pdf") throw new Error("Invalid file type");
    const id = crypto.randomUUID();
    const pdfMetadata = await getPdfMetadata(data);
    const thumbnailSrc = await writeFile(
      `${id}.png`,
      new Uint8Array(
        (await pdfMetadata.thumbnail?.arrayBuffer()) || new ArrayBuffer(0)
      )
    );
    const pdfSrc = await writeFile(
      `${id}.pdf`,
      new Uint8Array(await data.arrayBuffer())
    );
    const pdf: Pdf = {
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      name: pdfMetadata.title,
      filename: data.name,
      src: pdfSrc,
      size: data.size,
      pages: pdfMetadata.pages,
      thumbnail: thumbnailSrc,
      author:
        pdfMetadata.author ||
        pdfMetadata.creator ||
        pdfMetadata.producer ||
        "Unknown",
      creationDate: pdfMetadata.creationDate,
      modificationDate: pdfMetadata.modificationDate,
      progress: { percentage: 0, pages: 0 },
      hexColor: pdfMetadata.hexColor,
    };
    const categories = [...get().categories].map((cat) => {
      if (cat.id === categoryId) {
        return {
          ...cat,
          pdfs: [...cat.pdfs, pdf],
        };
      }
      return cat;
    });
    await get().setCategories(categories);
    return pdf;
  },
  updateCategory: async (
    categoryId = "default",
    category: Partial<Category>
  ) => {
    const categories = [...get().categories].map((cat) => {
      if (cat.id === categoryId) {
        return {
          ...cat,
          ...category,
        };
      }
      return cat;
    });

    await get().setCategories(categories);
  },
  deleteCategory: async (categoryId: string) => {
    if (categoryId === "default") return;
    const categories = [...get().categories].filter(
      (cat) => cat.id !== categoryId
    );
    await get().setCategories(categories);
  },
}));

await usePdfs.getState().load();
