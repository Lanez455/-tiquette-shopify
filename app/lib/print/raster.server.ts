// Tramage d'un PDF en points d'imprimante thermique : chaque point est noir ou
// blanc, sans gris, comme sous une tête thermique. Sert à l'impression directe
// (ZPL, Dymo) et au simulateur des tests : les deux voient exactement la même chose.
import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export interface RasterPage {
  dpi: number;
  width: number;
  height: number;
  // 0 = point noir, 255 = papier blanc
  dots: Uint8ClampedArray;
}

// Seuil d'une tête thermique : un point est chauffé (noir) ou pas
const THRESHOLD = 128;

export async function rasterizePdf(pdf: Uint8Array, dpi: 203 | 300 | 600): Promise<RasterPage[]> {
  const task = getDocument({ data: pdf.slice(), verbosity: 0 });
  const doc = await task.promise;
  const pages: RasterPage[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const viewport = page.getViewport({ scale: dpi / 72 });
    const width = Math.round(viewport.width);
    const height = Math.round(viewport.height);
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    // Pas d'anticrénelage : une imprimante thermique ne fait pas de gris
    context.imageSmoothingEnabled = false;
    await page.render({ canvas: canvas as never, canvasContext: context as never, viewport }).promise;
    const rgba = context.getImageData(0, 0, width, height).data;
    const dots = new Uint8ClampedArray(width * height);
    for (let i = 0; i < dots.length; i++) {
      const lum = 0.299 * rgba[i * 4]! + 0.587 * rgba[i * 4 + 1]! + 0.114 * rgba[i * 4 + 2]!;
      dots[i] = lum < THRESHOLD ? 0 : 255;
    }
    pages.push({ dpi, width, height, dots });
    page.cleanup();
  }
  await task.destroy();
  return pages;
}

