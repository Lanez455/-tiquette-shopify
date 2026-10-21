// Simulateur d'imprimante thermique, pour les tests uniquement.
// Il « imprime » un PDF comme le ferait une tête thermique : une grille de points
// à 203 ou 300 points par pouce, chaque point noir ou blanc, sans gris. Puis il
// scanne le résultat et signale ce qui serait coupé ou illisible.
import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { PNG } from "pngjs";
import {
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  NotFoundException,
  RGBLuminanceSource,
} from "@zxing/library";

export interface PrintedPage {
  dpi: number;
  width: number;
  height: number;
  // 0 = point noir, 255 = papier blanc
  dots: Uint8ClampedArray;
}

// Seuil d'une tête thermique : un point est chauffé (noir) ou pas
const THRESHOLD = 128;

export async function printPdf(pdf: Uint8Array, dpi: 203 | 300 | 600): Promise<PrintedPage[]> {
  const task = getDocument({ data: pdf.slice(), verbosity: 0 });
  const doc = await task.promise;
  const pages: PrintedPage[] = [];
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

// Ce qu'un scanner lit sur l'étiquette imprimée, ou null
export function scanPrinted(page: PrintedPage): string | null {
  const reader = new MultiFormatReader();
  const hints = new Map([[DecodeHintType.TRY_HARDER, true]]);
  try {
    const source = new RGBLuminanceSource(page.dots, page.width, page.height);
    return reader.decode(new BinaryBitmap(new HybridBinarizer(source)), hints).getText();
  } catch (error) {
    if (error instanceof NotFoundException) return null;
    throw error;
  }
}

// Plus petite distance (en mm) entre l'encre et le bord du papier. Les têtes
// thermiques n'impriment pas jusqu'au bord : en dessous de ~1 mm, ça se coupe.
export function inkMarginMm(page: PrintedPage): number {
  let top = page.height, bottom = page.height, left = page.width, right = page.width;
  for (let y = 0; y < page.height; y++) {
    for (let x = 0; x < page.width; x++) {
      if (page.dots[y * page.width + x] !== 0) continue;
      top = Math.min(top, y);
      bottom = Math.min(bottom, page.height - 1 - y);
      left = Math.min(left, x);
      right = Math.min(right, page.width - 1 - x);
    }
  }
  return (Math.min(top, bottom, left, right) / page.dpi) * 25.4;
}

// Découpe une zone de la page (une étiquette d'une planche)
export function cropMm(page: PrintedPage, xMm: number, yMm: number, wMm: number, hMm: number): PrintedPage {
  const toDots = (mm: number) => Math.round((mm / 25.4) * page.dpi);
  const x0 = toDots(xMm), y0 = toDots(yMm);
  const width = Math.min(toDots(wMm), page.width - x0);
  const height = Math.min(toDots(hMm), page.height - y0);
  const dots = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) {
    dots.set(page.dots.subarray((y0 + y) * page.width + x0, (y0 + y) * page.width + x0 + width), y * width);
  }
  return { dpi: page.dpi, width, height, dots };
}

export function hasInk(page: PrintedPage): boolean {
  return page.dots.some((d) => d === 0);
}

export function toPng(page: PrintedPage): Buffer {
  const png = new PNG({ width: page.width, height: page.height });
  for (let i = 0; i < page.dots.length; i++) {
    png.data[i * 4] = png.data[i * 4 + 1] = png.data[i * 4 + 2] = page.dots[i]!;
    png.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(png);
}
