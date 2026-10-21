import { describe, expect, it } from "vitest";
import { FakeShop } from "~/testing/fakeShop";
import { expandToVariantIds, fetchVariantsForLabels, productSearchQuery } from "./catalog";

describe("lecture du catalogue", () => {
  it("transforme produits et variantes en variantes, sans doublon", async () => {
    const shop = new FakeShop();
    shop.addProduct({ id: "gid://shopify/Product/1" }, [{ id: "gid://shopify/ProductVariant/11" }, { id: "gid://shopify/ProductVariant/12" }]);
    const ids = await expandToVariantIds(shop.gql, ["gid://shopify/Product/1", "gid://shopify/ProductVariant/12"]);
    expect(ids).toEqual(["gid://shopify/ProductVariant/11", "gid://shopify/ProductVariant/12"]);
  });

  it("lit les champs d'étiquette, dont les métachamps produit et variante (F6)", async () => {
    const shop = new FakeShop();
    shop.addProduct(
      { id: "p", title: "Bague", vendor: "Atelier", metafields: [{ namespace: "custom", key: "matiere", value: "Argent" }] },
      [{ id: "v", sku: "B-1", metafields: [{ namespace: "custom", key: "taille", value: "52" }] }],
    );
    const [item] = await fetchVariantsForLabels(shop.gql, ["v", "inconnue"]);
    expect(item).toMatchObject({
      title: "Bague", vendor: "Atelier", sku: "B-1",
      metafields: { "product.custom.matiere": "Argent", "variant.custom.taille": "52" },
    });
  });

  it("découpe les grosses sélections en appels de 100", async () => {
    const shop = new FakeShop();
    shop.addProduct({ id: "p" }, Array.from({ length: 230 }, (_, i) => ({ id: `v${i}` })));
    const items = await fetchVariantsForLabels(shop.gql, [...shop.variants.keys()]);
    expect(items).toHaveLength(230);
    expect(shop.calls.filter((c) => c.operation === "VariantsForLabels")).toHaveLength(3);
  });

  it("échappe les filtres saisis par le marchand", () => {
    expect(productSearchQuery({ vendor: 'Atelier "Lune"', collectionId: "gid://shopify/Collection/42", createdSince: "2026-10-01" })).toBe(
      'collection_id:42 AND vendor:"Atelier \\"Lune\\"" AND created_at:>=2026-10-01',
    );
    expect(productSearchQuery({ createdSince: "hier; DROP" })).toBe("");
  });
});
