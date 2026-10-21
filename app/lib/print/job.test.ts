import { describe, expect, it } from "vitest";
import type { LabelVariant } from "../shopify/catalog";
import { expandLines, groupLinesByTemplate, initialQuantity, PrintJobError } from "./job";

const variant = (id: string, collectionIds: string[] = []): LabelVariant => ({
  variantId: id, productId: "p", title: id, collectionIds, inventoryQuantity: 7, barcode: "LB00000001",
});

describe("quantité par défaut (F13)", () => {
  it("suit le réglage du marchand", () => {
    expect(initialQuantity("zero", 7)).toBe(0);
    expect(initialQuantity("one", 7)).toBe(1);
    expect(initialQuantity("stock", 7)).toBe(7);
    expect(initialQuantity("stock", -3)).toBe(0);
    expect(initialQuantity("stock", null)).toBe(0);
    expect(initialQuantity("stock", 50_000)).toBe(1000);
  });
});

describe("lignes d'impression", () => {
  const variants = [variant("a"), variant("b")];

  it("produit autant d'étiquettes que d'unités, dans l'ordre", () => {
    const items = expandLines([{ variantId: "b", quantity: 2 }, { variantId: "a", quantity: 1 }, { variantId: "a", quantity: 0 }], variants);
    expect(items.map((i) => i.title)).toEqual(["b", "b", "a"]);
  });

  it("refuse les quantités négatives, décimales ou énormes", () => {
    for (const quantity of [-1, 1.5, 1001]) {
      expect(() => expandLines([{ variantId: "a", quantity }], variants)).toThrow(PrintJobError);
    }
    expect(() => expandLines(Array.from({ length: 6 }, () => ({ variantId: "a", quantity: 1000 })), variants)).toThrow(PrintJobError);
  });

  it("ignore une variante supprimée entre-temps", () => {
    expect(expandLines([{ variantId: "zz", quantity: 3 }], variants)).toEqual([]);
  });
});

describe("modèle automatique par collection (F20)", () => {
  it("sépare bijoux et vêtements sans choix manuel", () => {
    const variants = [variant("bague", ["c-bijoux"]), variant("tshirt", ["c-vetements"]), variant("mug")];
    const groups = groupLinesByTemplate(
      variants.map((v) => ({ variantId: v.variantId, quantity: 1 })),
      variants,
      [{ templateId: "t-bijou", collectionIds: ["c-bijoux"] }, { templateId: "t-2x1", collectionIds: ["c-vetements"] }],
      "t-defaut",
    );
    expect(Object.fromEntries([...groups].map(([t, l]) => [t, l.map((x) => x.variantId)]))).toEqual({
      "t-bijou": ["bague"],
      "t-2x1": ["tshirt"],
      "t-defaut": ["mug"],
    });
  });
});
