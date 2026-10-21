import { describe, expect, it } from "vitest";
import { buildInternalCode, type Symbology } from "~/lib/barcode/generate";
import { defaultLayout } from "~/lib/labels/defaultLayouts";
import { FORMATS } from "~/lib/labels/formats";
import { renderLabels } from "~/lib/labels/pdf";
import { layoutSlots } from "~/lib/labels/sheet";
import { cropMm, hasInk, inkMarginMm, printPdf, scanPrinted } from "./printSimulator";

// Chaque format prêt, imprimé sur une thermique simulée, doit sortir lisible,
// sans rien de coupé, et son code-barres doit se scanner.
const ITEM = {
  title: "Boucles d'oreilles créoles argent 925 et zircon, modèle Lune",
  price: "29.90",
  compareAtPrice: "39.90",
  sku: "BO-LUNE-925",
};
const SYMBOLOGIES: Symbology[] = ["ean13", "upca", "code128"];
const rolls = FORMATS.filter((f) => f.kind === "roll");

describe("impression simulée des rouleaux", () => {
  for (const format of rolls) {
    for (const dpi of [203, 300] as const) {
      for (const symbology of SYMBOLOGIES) {
        it(`${format.id} à ${dpi} ppp, ${symbology}`, async () => {
          const layout = defaultLayout(format);
          const barcode = buildInternalCode(symbology, 123);
          const { pdf, barcodeTooWide } = await renderLabels({
            format,
            layout,
            printerDpi: dpi,
            items: [{ ...ITEM, barcode }],
            price: { currency: "EUR", locale: "fr-FR" },
          });
          expect(barcodeTooWide).toEqual([]);
          const [page] = await printPdf(pdf, dpi);
          expect(hasInk(page!)).toBe(true);
          expect(inkMarginMm(page!)).toBeGreaterThanOrEqual(1);
          if (layout.elements.some((e) => e.kind === "barcode")) {
            expect(scanPrinted(page!)).toBe(barcode);
          }
        });
      }
    }
  }
});

describe("impression simulée des planches (laser 600 ppp)", () => {
  for (const format of FORMATS.filter((f) => f.kind === "sheet")) {
    it(`${format.id} : chaque étiquette se scanne, à partir de la ligne 2, colonne 2`, async () => {
      if (format.kind !== "sheet") return;
      const codes = Array.from({ length: format.columns + 1 }, (_, i) => buildInternalCode("ean13", 500 + i));
      const { pdf, barcodeTooWide } = await renderLabels({
        format,
        layout: defaultLayout(format),
        items: codes.map((barcode) => ({ ...ITEM, barcode })),
        price: { currency: "EUR", locale: "fr-FR" },
        start: { row: 2, column: 2 },
      });
      expect(barcodeTooWide).toEqual([]);
      const [page] = await printPdf(pdf, 600);
      const slots = layoutSlots(format, codes.length, { row: 2, column: 2 });
      codes.forEach((code, i) => {
        const slot = slots[i]!;
        expect(scanPrinted(cropMm(page!, slot.xMm, slot.yMm, format.widthMm, format.heightMm))).toBe(code);
      });
      // La case 1-1, sautée, doit rester blanche
      expect(hasInk(cropMm(page!, format.marginLeftMm, format.marginTopMm, format.widthMm, format.heightMm))).toBe(false);
    });
  }
});

describe("titre long sur chaque format", () => {
  for (const format of FORMATS) {
    it(`${format.id} : le titre de 60 caractères tient sans débordement`, async () => {
      const { overflows } = await renderLabels({
        format,
        layout: defaultLayout(format),
        items: [{ ...ITEM, barcode: "LB00000001" }],
        price: { currency: "EUR", locale: "fr-FR" },
      });
      expect(overflows).toEqual([]);
    });
  }
});
