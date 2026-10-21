import { describe, expect, it } from "vitest";
import { gtinCheckDigit, isValidGtin, normalizeBarcode } from "./checksum";
import { allocateCodes, buildInternalCode } from "./generate";
import {
  ConfirmationRequiredError,
  findDuplicates,
  planBarcodes,
  replaceConfirmationPhrase,
  type VariantBarcode,
} from "./plan";

describe("clé de contrôle", () => {
  it("calcule les clés de codes réels", () => {
    expect(gtinCheckDigit("400638133393")).toBe(1); // EAN-13 4006381333931
    expect(gtinCheckDigit("03600029145")).toBe(2); // UPC-A 036000291452
    expect(isValidGtin("4006381333931")).toBe(true);
    expect(isValidGtin("036000291452")).toBe(true);
    expect(isValidGtin("4006381333932")).toBe(false);
    expect(isValidGtin("12345")).toBe(false);
  });

  it("considère un UPC-A et son EAN-13 comme le même code", () => {
    expect(normalizeBarcode("036000291452")).toBe(normalizeBarcode("0036000291452"));
  });
});

describe("codes internes", () => {
  it("produit des EAN-13 et UPC-A valides dans les plages réservées", () => {
    const ean = buildInternalCode("ean13", 1);
    const upc = buildInternalCode("upca", 1);
    expect(ean).toMatch(/^20\d{11}$/);
    expect(isValidGtin(ean)).toBe(true);
    expect(upc).toMatch(/^4\d{11}$/);
    expect(isValidGtin(upc)).toBe(true);
    expect(buildInternalCode("code128", 42)).toBe("LB00000042");
  });

  it("saute les codes déjà présents dans le catalogue", () => {
    const taken = [buildInternalCode("ean13", 1), buildInternalCode("ean13", 2)];
    const { codes, nextCounter } = allocateCodes(2, "ean13", 1, taken);
    expect(codes).toEqual([buildInternalCode("ean13", 3), buildInternalCode("ean13", 4)]);
    expect(nextCounter).toBe(5);
  });
});

function catalogOf(size: number, withCodeEvery: number): VariantBarcode[] {
  return Array.from({ length: size }, (_, i) => ({
    variantId: `gid://shopify/ProductVariant/${4_000_000_000 + i * 100_000_000}`,
    // Codes existants mêlant fabricants et codes internes déjà émis
    barcode: i % withCodeEvery === 0 ? buildInternalCode("ean13", i + 1) : null,
  }));
}

describe("F10 : 10 000 variantes sans doublon", () => {
  it("n'introduit aucun doublon et ne dérive rien de l'ID de variante", () => {
    const catalog = catalogOf(10_000, 3);
    const plan = planBarcodes(catalog, catalog, "ean13", 1);
    const after = catalog.map((v) => {
      const a = plan.assignments.find((x) => x.variantId === v.variantId);
      return { ...v, barcode: a ? a.newValue : v.barcode };
    });
    expect(after.every((v) => v.barcode)).toBe(true);
    expect(findDuplicates(after).size).toBe(0);
    for (const a of plan.assignments) {
      const idDigits = a.variantId.replace(/\D/g, "");
      expect(idDigits.endsWith(a.newValue.slice(-9, -1))).toBe(false);
      expect(isValidGtin(a.newValue)).toBe(true);
    }
  });

  it("signale un doublon existant", () => {
    const dupes = findDuplicates([
      { variantId: "a", barcode: "036000291452" },
      { variantId: "b", barcode: "0036000291452" },
      { variantId: "c", barcode: null },
    ]);
    expect([...dupes.values()]).toEqual([["a", "b"]]);
  });
});

describe("F11 : codes existants protégés", () => {
  const catalog: VariantBarcode[] = [
    { variantId: "a", barcode: "4006381333931" },
    { variantId: "b", barcode: null },
    { variantId: "c", barcode: "  " },
  ];

  it("ne touche jamais un code existant par défaut", () => {
    const plan = planBarcodes(catalog, catalog, "ean13", 1);
    expect(plan.assignments.map((a) => a.variantId)).toEqual(["b", "c"]);
    expect(plan.keptCount).toBe(1);
  });

  it("refuse le remplacement en masse sans la phrase exacte", () => {
    expect(() =>
      planBarcodes(catalog, catalog, "ean13", 1, { kind: "replace", confirmation: "oui" }),
    ).toThrow(ConfirmationRequiredError);
  });

  it("remplace avec confirmation et garde l'ancienne valeur pour revenir en arrière", () => {
    const plan = planBarcodes(catalog, catalog, "ean13", 1, {
      kind: "replace",
      confirmation: replaceConfirmationPhrase(1),
    });
    expect(plan.assignments[0]).toMatchObject({ variantId: "a", oldValue: "4006381333931" });
    // Le nouveau code ne reprend jamais un ancien code du catalogue
    expect(plan.assignments.map((a) => a.newValue)).not.toContain("4006381333931");
  });
});
