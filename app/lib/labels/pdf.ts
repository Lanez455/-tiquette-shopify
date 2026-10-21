import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import fontkit from "@pdf-lib/fontkit";
import bwipjs from "bwip-js/node";
import { degrees, PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { isValidGtin } from "../barcode/checksum";
import { fitText } from "./fitText";
import type { LabelFormat } from "./formats";
import { formatPrice, type PriceOptions } from "./price";
import { layoutSlots, type StartCell } from "./sheet";
import type { FieldKey, LabelElement, LabelItem, LabelTemplateLayout } from "./template";
import { mmToPt } from "./units";

export interface RenderOptions {
  format: LabelFormat;
  layout: LabelTemplateLayout;
  // Une entrée par étiquette : une variante en 3 exemplaires apparaît 3 fois
  items: LabelItem[];
  price: PriceOptions;
  start?: StartCell;
  // Réglages fins (F4)
  offsetXMm?: number;
  offsetYMm?: number;
  rotate90?: boolean;
}

export interface RenderResult {
  pdf: Uint8Array;
  // Textes trop longs même à la taille minimale, à signaler dans l'aperçu
  overflows: { itemIndex: number; element: number }[];
}

const require = createRequire(import.meta.url);

// DejaVu Sans couvre le latin, le cyrillique et l'arabe (F9). Les polices
// standard des PDF ne gèrent que l'alphabet latin.
async function loadFonts(doc: PDFDocument) {
  doc.registerFontkit(fontkit);
  const [regular, bold] = await Promise.all([
    readFile(require.resolve("dejavu-fonts-ttf/ttf/DejaVuSans.ttf")),
    readFile(require.resolve("dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf")),
  ]);
  return {
    regular: await doc.embedFont(regular, { subset: true }),
    bold: await doc.embedFont(bold, { subset: true }),
  };
}

function barcodeType(code: string): string {
  if (/^\d{13}$/.test(code) && isValidGtin(code)) return "ean13";
  if (/^\d{12}$/.test(code) && isValidGtin(code)) return "upca";
  if (/^\d{8}$/.test(code) && isValidGtin(code)) return "ean8";
  return "code128";
}

const BWIP_SCALE = 4;
// bwip-js compte la hauteur des barres en mm à 72 points par pouce
const PX_PER_MM = (72 / 25.4) * BWIP_SCALE;

const pngSize = (png: Buffer) => ({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) });

// Largeur maximale d'une barre fine. Au-delà, le code et ses chiffres deviennent
// démesurés sur une étiquette large ; 0,33 mm est la taille nominale d'un EAN-13.
const MAX_MODULE_MM = 0.4;

// Ajuste la hauteur des barres pour que le code remplisse sa zone : la largeur
// dépend du nombre de modules, la hauteur est libre.
export async function barcodePng(code: string, boxWMm: number, boxHMm: number, showDigits: boolean): Promise<Buffer> {
  const render = (heightMm: number) =>
    bwipjs.toBuffer({
      bcid: barcodeType(code),
      text: code,
      scale: BWIP_SCALE,
      height: heightMm,
      includetext: showDigits,
      textxalign: "center",
      // Marge blanche autour des barres : sans elle, les scanners ratent les EAN et UPC
      paddingwidth: 10,
      paddingheight: 2,
    });
  const firstHeightMm = 10;
  const first = pngSize(await render(firstHeightMm));
  const extraPx = first.height - firstHeightMm * PX_PER_MM;
  const drawnWidthMm = Math.min(boxWMm, (first.width / BWIP_SCALE) * MAX_MODULE_MM);
  const targetPx = (first.width * boxHMm) / drawnWidthMm - extraPx;
  return render(Math.max(3, Math.min(60, targetPx / PX_PER_MM)));
}

function fieldValue(item: LabelItem, field: FieldKey, price: PriceOptions): string {
  const money = (value?: string | null) => (value ? formatPrice(value, price) : "");
  switch (field) {
    case "title":
      return item.title;
    case "variantTitle":
      // Shopify nomme « Default Title » la variante unique d'un produit
      return item.variantTitle && item.variantTitle !== "Default Title" ? item.variantTitle : "";
    case "sku":
      return item.sku ?? "";
    case "price":
      return money(item.price);
    case "compareAtPrice":
      return money(item.compareAtPrice);
    case "vendor":
      return item.vendor ?? "";
    case "productType":
      return item.productType ?? "";
    case "barcodeDigits":
      return item.barcode ?? "";
    default:
      return item.metafields?.[field.slice("metafield:".length)] ?? "";
  }
}

export async function renderLabels(options: RenderOptions): Promise<RenderResult> {
  const { format, layout, items, price } = options;
  const doc = await PDFDocument.create();
  const fonts = await loadFonts(doc);
  const pageW = mmToPt(format.kind === "sheet" ? format.pageWidthMm : format.widthMm);
  const pageH = mmToPt(format.kind === "sheet" ? format.pageHeightMm : format.heightMm);
  const offsetX = mmToPt(options.offsetXMm ?? 0);
  const offsetY = mmToPt(options.offsetYMm ?? 0);
  const overflows: RenderResult["overflows"] = [];
  const barcodeCache = new Map<string, Awaited<ReturnType<PDFDocument["embedPng"]>>>();

  const pages: PDFPage[] = [];
  const slots = layoutSlots(format, items.length, options.start);

  for (const [index, item] of items.entries()) {
    const slot = slots[index]!;
    while (pages.length <= slot.page) {
      const page = doc.addPage([pageW, pageH]);
      if (options.rotate90) page.setRotation(degrees(90));
      pages.push(page);
    }
    const page = pages[slot.page]!;
    // Origine PDF en bas à gauche ; nos positions partent du haut à gauche
    const toX = (mm: number) => mmToPt(slot.xMm + mm) + offsetX;
    const toY = (mm: number) => pageH - mmToPt(slot.yMm + mm) - offsetY;

    for (const [elementIndex, element] of layout.elements.entries()) {
      if (element.kind === "barcode") {
        if (!item.barcode) continue;
        const cacheKey = `${item.barcode}|${element.wMm}|${element.hMm}|${element.showDigits}`;
        let image = barcodeCache.get(cacheKey);
        if (!image) {
          image = await doc.embedPng(await barcodePng(item.barcode, element.wMm, element.hMm, element.showDigits));
          barcodeCache.set(cacheKey, image);
        }
        // Garde les proportions pour que le code reste lisible au scan
        const boxW = mmToPt(element.wMm);
        const boxH = mmToPt(element.hMm);
        const scale = Math.min(boxW / image.width, boxH / image.height);
        const w = image.width * scale;
        const h = image.height * scale;
        page.drawImage(image, {
          x: toX(element.xMm) + (boxW - w) / 2,
          y: toY(element.yMm) - boxH + (boxH - h) / 2,
          width: w,
          height: h,
        });
        continue;
      }

      const text = element.kind === "text" ? element.text : fieldValue(item, element.field, price);
      if (!text) continue;
      const font: PDFFont = element.bold ? fonts.bold : fonts.regular;
      const fit = fitText(text, (t, size) => font.widthOfTextAtSize(t, size), {
        maxWidth: mmToPt(element.wMm),
        maxHeight: mmToPt(element.hMm),
        maxFontSize: element.maxFontSize,
        minFontSize: element.minFontSize,
        maxLines: element.maxLines,
      });
      if (fit.overflow) overflows.push({ itemIndex: index, element: elementIndex });

      const lineH = fit.fontSize * 1.15;
      for (const [lineIndex, line] of fit.lines.entries()) {
        const width = font.widthOfTextAtSize(line, fit.fontSize);
        const boxW = mmToPt(element.wMm);
        const dx = element.align === "center" ? (boxW - width) / 2 : element.align === "right" ? boxW - width : 0;
        const x = toX(element.xMm) + dx;
        const y = toY(element.yMm) - (lineIndex + 1) * lineH + (lineH - fit.fontSize) / 2 + fit.fontSize * 0.2;
        page.drawText(line, { x, y, size: fit.fontSize, font, color: rgb(0, 0, 0) });
        // Prix barré (F6)
        if (element.kind === "field" && element.field === "compareAtPrice") {
          const strikeY = y + fit.fontSize * 0.3;
          page.drawLine({
            start: { x, y: strikeY },
            end: { x: x + width, y: strikeY },
            thickness: Math.max(0.5, fit.fontSize / 14),
          });
        }
      }
    }
  }

  if (pages.length === 0) doc.addPage([pageW, pageH]);
  return { pdf: await doc.save(), overflows };
}
