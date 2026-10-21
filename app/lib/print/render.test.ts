import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { defaultLayout } from "../labels/defaultLayouts";
import { getFormat } from "../labels/formats";
import type { ResolvedTemplate } from "../labels/templates.server";
import { FakeShop } from "~/testing/fakeShop";
import { printPdf, scanPrinted } from "~/testing/printSimulator";
import { PrintJobError } from "./job";
import { AUTO_TEMPLATE, renderPrintGroups } from "./render";

const template = (id: string, formatId: string, collectionIds: string[] = []): ResolvedTemplate => {
  const format = getFormat(formatId)!;
  return { id, name: id, format, layout: defaultLayout(format), collectionIds, builtin: false };
};
const templates = [template("bijou", "bijou-halteres", ["c-bijoux"]), template("std", "zebra-2x1")];
const settings = { offsetXmm: 0, offsetYmm: 0, rotate90: false, printerDpi: 203, price: { currency: "EUR", locale: "fr-FR" } };

function shop() {
  const s = new FakeShop();
  s.addProduct({ id: "p1", title: "Bague Lune", collectionIds: ["c-bijoux"] }, [{ id: "v1", barcode: "2000000000015", price: "29.90" }]);
  s.addProduct({ id: "p2", title: "T-shirt" }, [{ id: "v2", barcode: "LB00000002", title: "M" }, { id: "v3", title: "L" }]);
  return s;
}

describe("préparation d'une impression", () => {
  it("de bout en bout : la boutique, le PDF, puis le scan de l'étiquette imprimée", async () => {
    const { groups } = await renderPrintGroups({
      gql: shop().gql, lines: [{ variantId: "v1", quantity: 3 }], templates, templateId: "std", fallbackTemplateId: "std", settings,
    });
    expect(groups).toHaveLength(1);
    const pages = await printPdf(groups[0]!.pdf, 203);
    expect(pages).toHaveLength(3);
    expect(scanPrinted(pages[0]!)).toBe("2000000000015");
  });

  it("répartit automatiquement par collection (F20)", async () => {
    const { groups } = await renderPrintGroups({
      gql: shop().gql,
      lines: [{ variantId: "v1", quantity: 2 }, { variantId: "v2", quantity: 1 }],
      templates, templateId: AUTO_TEMPLATE, fallbackTemplateId: "std", settings,
    });
    expect(groups.map((g) => [g.templateId, g.labelCount])).toEqual([["bijou", 2], ["std", 1]]);
  });

  it("avertit quand une étiquette n'a pas de code-barres", async () => {
    const { groups } = await renderPrintGroups({
      gql: shop().gql, lines: [{ variantId: "v3", quantity: 1 }], templates, templateId: "std", fallbackTemplateId: "std", settings,
    });
    expect(groups[0]!.warnings.join()).toMatch(/sans code-barres/);
  });

  it("refuse une impression où tout est à 0", async () => {
    await expect(
      renderPrintGroups({ gql: shop().gql, lines: [{ variantId: "v1", quantity: 0 }], templates, templateId: "std", fallbackTemplateId: "std", settings }),
    ).rejects.toThrow(PrintJobError);
  });

  it("l'aperçu ne produit qu'une étiquette", async () => {
    const { groups } = await renderPrintGroups({
      gql: shop().gql, lines: [{ variantId: "v1", quantity: 40 }], templates, templateId: "std", fallbackTemplateId: "std", settings, preview: true,
    });
    expect((await PDFDocument.load(groups[0]!.pdf)).getPageCount()).toBe(1);
  });

  it("applique le décalage du réglage fin (F4) : 1 mm se voit", async () => {
    const render = (offsetXmm: number) =>
      renderPrintGroups({ gql: shop().gql, lines: [{ variantId: "v1", quantity: 1 }], templates, templateId: "std", fallbackTemplateId: "std", settings: { ...settings, offsetXmm } });
    const firstInkColumn = async (offsetXmm: number) => {
      const [page] = await printPdf((await render(offsetXmm)).groups[0]!.pdf, 203);
      for (let x = 0; x < page!.width; x++) for (let y = 0; y < page!.height; y++) if (page!.dots[y * page!.width + x] === 0) return x;
      return -1;
    };
    const shift = (await firstInkColumn(1)) - (await firstInkColumn(0));
    // 1 mm à 203 ppp = 8 points
    expect(shift).toBeGreaterThanOrEqual(7);
    expect(shift).toBeLessThanOrEqual(9);
  });
});
