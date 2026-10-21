import { describe, expect, it } from "vitest";
import { buildInternalCode } from "~/lib/barcode/generate";
import { defaultLayout } from "~/lib/labels/defaultLayouts";
import { FORMATS, getFormat } from "~/lib/labels/formats";
import { renderLabels } from "~/lib/labels/pdf.server";
import { printPdf, scanPrinted } from "~/testing/printSimulator";
import { decodeZpl } from "~/testing/zplDecoder";
import { groupIdentical, pagesToZpl, zplGraphic } from "./zpl";

const ITEM = { title: "Créoles argent 925 « Lune » — Ünïcödé", price: "29.90", compareAtPrice: "39.90", sku: "BO-LUNE" };
const price = { currency: "EUR", locale: "fr-FR" };

describe("impression directe Zebra en ZPL (F17)", () => {
  it("compression : lignes vides, pleines, répétées", () => {
    const width = 64;
    const dots = new Uint8ClampedArray(width * 4).fill(255);
    dots.fill(0, width * 1, width * 2); // ligne 2 noire
    dots.fill(0, width * 2, width * 3); // ligne 3 identique
    dots.fill(0, width * 3, width * 3 + 4); // ligne 4 : 4 points noirs
    const g = zplGraphic({ dpi: 203, width, height: 4, dots });
    expect(g).toEqual({ bytesPerRow: 8, totalBytes: 32, data: ",!:F," });
  });

  for (const format of FORMATS.filter((f) => f.kind === "roll")) {
    for (const dpi of [203, 300] as const) {
      it(`${format.id} à ${dpi} ppp : la Zebra imprime exactement le PDF, et ça se scanne`, async () => {
        const barcode = buildInternalCode("ean13", 42);
        const { pdf } = await renderLabels({ format, layout: defaultLayout(format), printerDpi: dpi, items: [{ ...ITEM, barcode }], price });
        const [page] = await printPdf(pdf, dpi);
        const zpl = pagesToZpl([page!]);
        expect(zpl).toMatch(/^\^XA\n\^CI28\n\^PW\d+\n\^LL\d+/);
        const [decoded] = decodeZpl(zpl, dpi);
        expect(decoded!.page.width).toBe(page!.width);
        expect(decoded!.page.height).toBe(page!.height);
        expect(Buffer.from(decoded!.page.dots).equals(Buffer.from(page!.dots))).toBe(true);
        if (defaultLayout(format).elements.some((e) => e.kind === "barcode")) expect(scanPrinted(decoded!.page)).toBe(barcode);
        // Compressé : plus court que l'image brute en hexadécimal
        expect(zpl.length).toBeLessThan((page!.width * page!.height) / 4);
      });
    }
  }

  it("3 × la même variante puis 1 autre : 2 images, ^PQ3 puis ^PQ1", async () => {
    const format = getFormat("zebra-2x1")!;
    const a = { ...ITEM, barcode: buildInternalCode("ean13", 1) };
    const b = { ...ITEM, barcode: buildInternalCode("ean13", 2) };
    const { pdf } = await renderLabels({ format, layout: defaultLayout(format), printerDpi: 203, items: [a, a, a, b], price });
    const pages = await printPdf(pdf, 203);
    expect(groupIdentical(pages).map((g) => g.copies)).toEqual([3, 1]);
    const decoded = decodeZpl(pagesToZpl(pages), 203);
    expect(decoded.map((d) => [scanPrinted(d.page), d.copies])).toEqual([[a.barcode, 3], [b.barcode, 1]]);
  });
});
