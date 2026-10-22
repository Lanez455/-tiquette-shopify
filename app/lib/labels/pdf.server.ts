import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import fontkit from "@pdf-lib/fontkit";
import { degrees, PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { barcodeGeometry, qrGeometry, snapToDots } from "./barcodeDraw";
import { fitText } from "./fitText";
import type { LabelFormat } from "./formats";
import { formatPrice, type PriceOptions } from "./price";
import { layoutSlots, type StartCell } from "./sheet";
import type { FieldKey, LabelItem, LabelTemplateLayout } from "./template";
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
  // Résolution de l'imprimante : les barres sont calées sur ses points.
  // 203 ppp pour la plupart des thermiques, 300 pour les modèles haut de gamme.
  printerDpi?: number;
}

export interface RenderResult {
  pdf: Uint8Array;
  // Textes trop longs même à la taille minimale, à signaler dans l'aperçu
  overflows: { itemIndex: number; element: number }[];
  // Codes-barres trop larges pour leur zone, même avec des barres d'un point
  barcodeTooWide: { itemIndex: number; element: number }[];
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

// Shopify nomme « Default Title » la variante unique d'un produit
const variantName = (item: LabelItem) => (item.variantTitle && item.variantTitle !== "Default Title" ? item.variantTitle : "");

export function fieldValue(item: LabelItem, field: FieldKey, price: PriceOptions): string {
  const money = (value?: string | null) => (value ? formatPrice(value, price) : "");
  switch (field) {
    case "title":
      return item.title;
    case "variantTitle":
      return variantName(item);
    case "titleWithVariant": {
      const variant = variantName(item);
      return variant ? `${item.title} · ${variant}` : item.title;
    }
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
  const barcodeTooWide: RenderResult["barcodeTooWide"] = [];
  const dpi = options.printerDpi ?? (format.kind === "sheet" ? 600 : 203);

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
        const boxW = mmToPt(element.wMm);
        const boxH = mmToPt(element.hMm);
        const geometry = barcodeGeometry(item.barcode, boxW, dpi);
        if (!geometry.fits) barcodeTooWide.push({ itemIndex: index, element: elementIndex });
        const digitSize = element.showDigits
          ? Math.min(boxH * 0.25, (geometry.widthPt / item.barcode.length) * 1.6, 9)
          : 0;
        const barsH = boxH - (element.showDigits ? digitSize * 1.15 : 0);
        const left = snapToDots(toX(element.xMm) + (boxW - geometry.widthPt) / 2, dpi);
        const top = toY(element.yMm);
        for (const bar of geometry.bars) {
          page.drawRectangle({ x: left + bar.x, y: top - barsH, width: bar.width, height: barsH, color: rgb(0, 0, 0) });
        }
        if (element.showDigits) {
          const textW = fonts.regular.widthOfTextAtSize(item.barcode, digitSize);
          page.drawText(item.barcode, {
            x: left + (geometry.widthPt - textW) / 2,
            y: top - boxH + digitSize * 0.15,
            size: digitSize,
            font: fonts.regular,
            color: rgb(0, 0, 0),
          });
        }
        continue;
      }

      if (element.kind === "qr") {
        if (!item.productUrl) continue;
        const boxPt = Math.min(mmToPt(element.wMm), mmToPt(element.hMm));
        const qr = qrGeometry(item.productUrl, boxPt, dpi);
        if (!qr.fits) barcodeTooWide.push({ itemIndex: index, element: elementIndex });
        const left = snapToDots(toX(element.xMm) + (mmToPt(element.wMm) - qr.sizePt) / 2, dpi);
        const top = snapToDots(toY(element.yMm) - (mmToPt(element.hMm) - qr.sizePt) / 2, dpi);
        for (const run of qr.runs) {
          page.drawRectangle({ x: left + run.x, y: top - run.y - run.size, width: run.width, height: run.size, color: rgb(0, 0, 0) });
        }
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
  return { pdf: await doc.save(), overflows, barcodeTooWide };
}
