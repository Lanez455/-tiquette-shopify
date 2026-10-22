import { describe, expect, it } from "vitest";
import { buildInternalCode } from "~/lib/barcode/generate";
import { cropMm, printPdf, scanPrinted } from "~/testing/printSimulator";
import { FakeShop } from "~/testing/fakeShop";
import { fetchVariantsForLabels } from "../shopify/catalog";
import { defaultLayout } from "./defaultLayouts";
import { getFormat } from "./formats";
import { renderLabels } from "./pdf.server";
import { addElement } from "./editorOps";
import { validateLayout } from "./validateLayout";

const URL_PRODUIT = "https://atelier-lune.fr/products/creoles-argent-925-lune";

describe("étiquettes de rayon et QR codes (F22)", () => {
  for (const dpi of [203, 300] as const) {
    it(`à ${dpi} ppp, le QR scanné ouvre la bonne fiche produit, et le code-barres se lit`, async () => {
      const format = getFormat("rayon-zebra-3x2")!;
      const layout = defaultLayout(format);
      const barcode = buildInternalCode("ean13", 7);
      const { pdf, barcodeTooWide, overflows } = await renderLabels({
        format, layout, printerDpi: dpi, price: { currency: "EUR", locale: "fr-FR" },
        items: [{ title: "Créoles argent 925 Lune", price: "24.90", compareAtPrice: "39.90", barcode, productUrl: URL_PRODUIT }],
      });
      expect(barcodeTooWide).toEqual([]);
      expect(overflows).toEqual([]);
      const [page] = await printPdf(pdf, dpi);
      const qr = layout.elements.find((e) => e.kind === "qr")!;
      const code = layout.elements.find((e) => e.kind === "barcode")!;
      expect(scanPrinted(cropMm(page!, qr.xMm - 1, qr.yMm, qr.wMm + 1.5, qr.hMm + 1))).toBe(URL_PRODUIT);
      expect(scanPrinted(cropMm(page!, 0, code.yMm - 0.5, format.widthMm, code.hMm + 1))).toBe(barcode);
    });
  }

  it("un QR sur une petite étiquette 1\" × 1\" reste lisible", async () => {
    const format = getFormat("zebra-1x1")!;
    const layout = addElement({ elements: [] }, { kind: "qr" }, format);
    const { pdf, barcodeTooWide } = await renderLabels({
      format, layout, printerDpi: 203, price: { currency: "EUR", locale: "fr-FR" },
      items: [{ title: "x", productUrl: URL_PRODUIT }],
    });
    expect(barcodeTooWide).toEqual([]);
    const [page] = await printPdf(pdf, 203);
    expect(scanPrinted(page!)).toBe(URL_PRODUIT);
  });

  it("le modèle avec QR passe la validation ; produit non publié : pas de QR", async () => {
    const format = getFormat("rayon-zebra-3x2")!;
    expect(validateLayout(defaultLayout(format), format.widthMm, format.heightMm).elements.some((e) => e.kind === "qr")).toBe(true);
    const shop = new FakeShop();
    shop.addProduct({ id: "p1", onlineStoreUrl: URL_PRODUIT }, [{ id: "v1" }]);
    shop.addProduct({ id: "p2" }, [{ id: "v2" }]);
    const variants = await fetchVariantsForLabels(shop.gql, ["v1", "v2"]);
    expect(variants.map((v) => v.productUrl)).toEqual([URL_PRODUIT, null]);
  });
});
