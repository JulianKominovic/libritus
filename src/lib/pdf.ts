import chroma from "chroma-js";
import { getDocument } from "pdfjs-dist";
import { getPaletteFromImageData } from "./color-thief";

/**
 * Transforms D:YYYYMMDDHHMMSS+HH'MM' to YYYY-MM-DDTHH:MM:SS+HH:MM
 * @param {string} strWithD Date string in D:YYYYMMDDHHMMSS+HH'MM format
 * @returns {string} Date string in YYYY-MM-DDTHH:MM:SS+HH:MM
 * @example
 * transformDate('D:20171003210151+00\'00\'')
 * // => 2017-10-03T21:01:51+00:00
 */
function transformDate(strWithD: string | undefined): Date | null {
  if (!strWithD) return null;
  const str = strWithD.replace("D:", "");
  const [dateAndTime, rawTimezone = "00'00'"] = str.split("+");
  const [year, month, day, hour, minute, second] = [
    dateAndTime.slice(0, 4),
    dateAndTime.slice(4, 6),
    dateAndTime.slice(6, 8),
    dateAndTime.slice(8, 10),
    dateAndTime.slice(10, 12),
    dateAndTime.slice(12, 14),
  ];
  const timezone = rawTimezone.replace("'", ":");
  return new Date(
    `${year}-${month}-${day}T${hour}:${minute}:${second}${timezone}`
  );
}

export async function getPdfMetadata(file: File): Promise<{
  title: string;
  author: string;
  creationDate: Date | null;
  modificationDate: Date | null;
  pages: number;
  creator: string;
  producer: string;
  thumbnail: Blob | null;
  hexColor: string;
}> {
  const pdfData = await file.arrayBuffer();
  const pdfDoc = await getDocument(pdfData).promise;
  const { info, metadata } = await pdfDoc.getMetadata();
  console.log(info, metadata);
  const title = (info as any).Title || file.name.replace(/\.[^/.]+$/, "");
  const author = (info as any).Author;
  const creationDate = transformDate((info as any).CreationDate);
  const modificationDate = transformDate((info as any).ModDate);
  const creator = (info as any).Creator;
  const producer = (info as any).Producer;
  const pages = pdfDoc.numPages;
  const canvas = document.createElement("canvas");
  const canvasContext = canvas.getContext("2d")!;
  const firstPage = await pdfDoc.getPage(1);
  const viewport = firstPage.getViewport({ scale: 1 });
  canvas.height = viewport.height;
  canvas.width = viewport.width;
  await firstPage.render({
    canvasContext: canvasContext,
    viewport: viewport,
    transform: [1, 0, 0, 1, 0, 0],
    // This prop exists in pdfjs-dist 5 not in 4.10.38
    // canvas: canvas,
    background: "#fff",
  }).promise;
  const thumbnail: Blob | null = await new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob);
    });
  });
  const dominantColor = getPaletteFromImageData(
    canvasContext.getImageData(0, 0, canvas.width, canvas.height)
  );
  const [r, g, b] = dominantColor || [33, 33, 33];
  const hexColor = chroma(r, g, b).hex();
  return {
    title,
    author,
    creationDate,
    modificationDate,
    pages,
    creator,
    producer,
    thumbnail,
    hexColor,
  };
}
