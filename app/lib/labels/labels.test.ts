import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { fitText } from "./fitText";
import { customFormat, FORMATS, getFormat } from "./formats";
import { renderLabels } from "./pdf";
import { formatPrice } from "./price";
import { layoutSlots } from "./sheet";
import type { LabelTemplateLayout } from "./template";
import { inToMm, mmToPt } from "./units";

const LAYOUT: LabelTemplateLayout = {
  elements: [
    { kind: "field", field: "title", xMm: 1, yMm: 1, wMm: 23, hMm: 7, maxFontSize: 9, minFontSize: 4, maxLines: 2 },
    { kind: "field", field: "price", xMm: 1, yMm: 8, wMm: 12, hMm: 4, maxFontSize: 9, minFontSize: 5, bold: true },
    { kind: "field", field: "compareAtPrice", xMm: 13, yMm: 8, wMm: 11, hMm: 4, maxFontSize: 7, minFontSize: 4 },
    { kind: "barcode", xMm: 1, yMm: 13, wMm: 23, hMm: 11, showDigits: true },
  ],
};
const EUR = { currency: "EUR", locale: "fr-FR" };

describe("formats (F1, F2)", () => {
  it("a des identifiants uniques et des dimensions positives", () => {
    expect(new Set(FORMATS.map((f) => f.id)).size).toBe(FORMATS.length);
    for (const f of FORMATS) expect(f.widthMm > 0 && f.heightMm > 0).toBe(true);
  });

  it("accepte une taille libre de 25 × 25 mm et un rond de 3 pouces", () => {
    expect(customFormat(25, 25)).toMatchObject({ widthMm: 25, heightMm: 25 });
    expect(customFormat(inToMm(3), inToMm(3), "round").shape).toBe("round");
    expect(() => customFormat(0, 10)).toThrow();
  });

  it("place les planches Avery dans la page", () => {
    for (const f of FORMATS) {
      if (f.kind !== "sheet") continue;
      const right = f.marginLeftMm + (f.columns - 1) * f.pitchXMm + f.widthMm;
      const bottom = f.marginTopMm + (f.rows - 1) * f.pitchYMm + f.heightMm;
      expect(right).toBeLessThanOrEqual(f.pageWidthMm);
      expect(bottom).toBeLessThanOrEqual(f.pageHeightMm + 0.01);
    }
  });
});

describe("case de départ sur planche entamée (F3)", () => {
  const avery = getFormat("avery-5160")!;

  it("démarre en ligne 4, colonne 2", () => {
    const [first] = layoutSlots(avery, 1, { row: 4, column: 2 });
    expect(first!.page).toBe(0);
    expect(first!.xMm).toBeCloseTo(inToMm(0.1875 + 2.75));
    expect(first!.yMm).toBeCloseTo(inToMm(0.5 + 3));
  });

  it("passe à la page suivante quand la planche est pleine", () => {
    const slots = layoutSlots(avery, 3, { row: 10, column: 3 });
    expect(slots.map((s) => s.page)).toEqual([0, 1, 1]);
    expect(slots[1]).toMatchObject({ xMm: avery.kind === "sheet" ? avery.marginLeftMm : 0 });
  });

  it("refuse une case hors planche", () => {
    expect(() => layoutSlots(avery, 1, { row: 11, column: 1 })).toThrow();
  });
});

describe("texte qui rétrécit (F7)", () => {
  const measure = (text: string, size: number) => text.length * size * 0.5;

  it("fait tenir un titre de 60 caractères sur une étiquette bijou, sans « … »", () => {
    const title = "Boucles d'oreilles créoles argent 925 et zircon, modèle Lune";
    expect(title.length).toBe(60);
    const fit = fitText(title, measure, { maxWidth: 70, maxHeight: 24, maxFontSize: 10, minFontSize: 3 });
    expect(fit.overflow).toBe(false);
    expect(fit.lines.join(" ")).toBe(title);
    expect(fit.fontSize).toBeLessThan(10);
  });

  it("garde la taille maximale quand le texte tient", () => {
    expect(fitText("Bague", measure, { maxWidth: 100, maxHeight: 20, maxFontSize: 9, minFontSize: 4 }).fontSize).toBe(9);
  });

  it("signale un texte impossible à faire tenir", () => {
    const fit = fitText("x".repeat(500), measure, { maxWidth: 20, maxHeight: 10, maxFontSize: 9, minFontSize: 6 });
    expect(fit.overflow).toBe(true);
  });
});

describe("prix selon la devise (F8)", () => {
  it("formate EUR, INR et AED", () => {
    expect(formatPrice("12.5", EUR)).toBe("12,50 €");
    expect(formatPrice(123456, { currency: "INR", locale: "en-IN" })).toBe("₹1,23,456.00");
    const aed = formatPrice(99, { currency: "AED", locale: "ar-AE" });
    expect(aed).toMatch(/د\.إ|AED/);
  });

  it("respecte la position du symbole imposée par le marchand", () => {
    expect(formatPrice(5, { ...EUR, symbolPosition: "before", spaceBetween: false })).toBe("€5,00");
    expect(formatPrice(5, { currency: "USD", locale: "en-US", symbolPosition: "after" })).toBe("5.00 $");
  });
});

describe("rendu PDF", () => {
  it("produit une page par étiquette, à la taille exacte du rouleau", async () => {
    const format = getFormat("dymo-30332")!;
    const { pdf, overflows } = await renderLabels({
      format,
      layout: LAYOUT,
      items: [
        { title: "Bague argent", price: "29.90", compareAtPrice: "39.90", barcode: "4006381333931" },
        { title: "Bague argent", price: "29.90", barcode: "4006381333931" },
      ],
      price: EUR,
    });
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(2);
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeCloseTo(mmToPt(format.widthMm));
    expect(height).toBeCloseTo(mmToPt(format.heightMm));
    expect(overflows).toEqual([]);
  });

  it("imprime le cyrillique, l'arabe, les apostrophes et barres obliques (F9)", async () => {
    await expect(
      renderLabels({
        format: getFormat("zebra-2x1")!,
        layout: LAYOUT,
        items: [
          { title: "Серьги «Луна» d'argent / 925", price: "10", barcode: "LB00000001" },
          { title: "عطر ورد", price: "10", barcode: "036000291452" },
        ],
        price: { currency: "AED", locale: "ar-AE" },
      }),
    ).resolves.toBeDefined();
  });

  it("remplit une planche Avery à partir de la case choisie", async () => {
    const items = Array.from({ length: 30 }, (_, i) => ({ title: `Article ${i}`, barcode: "LB00000001" }));
    const { pdf } = await renderLabels({
      format: getFormat("avery-5160")!,
      layout: LAYOUT,
      items,
      price: EUR,
      start: { row: 4, column: 2 },
    });
    // 30 étiquettes à partir de la 11e case : la planche déborde sur une 2e page
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(2);
  });
});
