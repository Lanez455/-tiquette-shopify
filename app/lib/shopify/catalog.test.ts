import { describe, expect, it } from "vitest";
import { FakeShop } from "~/testing/fakeShop";
import { estimateQueryCost } from "~/testing/queryCost";
import { expandToVariantIds, fetchVariantIdsByFilter, fetchVariantsForLabels, metafieldsUsed, productSearchQuery } from "./catalog";

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
    const [item] = await fetchVariantsForLabels(shop.gql, ["v", "inconnue"], {
      metafields: ["product.custom.matiere", "variant.custom.taille", "product.custom.absent"],
    });
    expect(item).toMatchObject({
      title: "Bague", vendor: "Atelier", sku: "B-1",
      metafields: { "product.custom.matiere": "Argent", "variant.custom.taille": "52" },
    });
  });

  it("ne demande que les métachamps utiles", async () => {
    const shop = new FakeShop();
    shop.addProduct({ id: "p", metafields: [{ namespace: "custom", key: "matiere", value: "Argent" }] }, [{ id: "v" }]);
    const [item] = await fetchVariantsForLabels(shop.gql, ["v"]);
    expect(item!.metafields).toEqual({});
    expect(
      metafieldsUsed([{ elements: [{ kind: "field", field: "metafield:product.custom.matiere" }, { kind: "field", field: "title" }, { kind: "barcode" }] }]),
    ).toEqual(["product.custom.matiere"]);
  });

  it("indique l'appartenance aux seules collections des règles", async () => {
    const shop = new FakeShop();
    shop.addProduct({ id: "p", collectionIds: ["gid://shopify/Collection/1", "gid://shopify/Collection/2"] }, [{ id: "v" }]);
    const [item] = await fetchVariantsForLabels(shop.gql, ["v"], { collectionIds: ["gid://shopify/Collection/2", "gid://shopify/Collection/9"] });
    expect(item!.collectionIds).toEqual(["gid://shopify/Collection/2"]);
  });

  it("reste sous la limite de coût Shopify, même avec beaucoup de métachamps", async () => {
    const shop = new FakeShop();
    shop.addProduct({ id: "p" }, Array.from({ length: 500 }, (_, i) => ({ id: `v${i}` })));
    const metafields = Array.from({ length: 30 }, (_, i) => `product.custom.champ${i}`);
    const items = await fetchVariantsForLabels(shop.gql, [...shop.variants.keys()], { metafields, collectionIds: ["gid://shopify/Collection/1"] });
    expect(items).toHaveLength(500);
    // La fausse boutique refuse déjà toute requête au-delà de 1 000 points
    expect(shop.calls.filter((c) => c.operation === "VariantsForLabels").length).toBeGreaterThan(1);
  });

  it("garde toutes les variantes d'un produit qui en a plus de 250", async () => {
    const shop = new FakeShop();
    shop.addProduct({ id: "gid://shopify/Product/7" }, Array.from({ length: 600 }, (_, i) => ({ id: `gid://shopify/ProductVariant/${1000 + i}` })));
    shop.addProduct({ id: "gid://shopify/Product/8" }, [{ id: "gid://shopify/ProductVariant/9" }]);
    const ids = await expandToVariantIds(shop.gql, ["gid://shopify/Product/8", "gid://shopify/Product/7", "gid://shopify/Product/404"]);
    expect(ids).toHaveLength(601);
    expect(ids[0]).toBe("gid://shopify/ProductVariant/9");
  });

  it("sélectionne tout un filtre, plafonné à 2 000 variantes", async () => {
    const shop = new FakeShop();
    shop.addProduct({ id: "gid://shopify/Product/1", vendor: "Atelier", createdAt: "2026-10-05" }, [{ id: "a1" }, { id: "a2" }]);
    shop.addProduct({ id: "gid://shopify/Product/2", vendor: "Atelier", createdAt: "2026-09-01" }, [{ id: "b1" }]);
    shop.addProduct({ id: "gid://shopify/Product/3", vendor: "Autre" }, [{ id: "c1" }]);
    expect(await fetchVariantIdsByFilter(shop.gql, { vendor: "Atelier" })).toEqual({ ids: ["a1", "a2", "b1"], truncated: false });
    expect(await fetchVariantIdsByFilter(shop.gql, { vendor: "Atelier", createdSince: "2026-10-01" })).toEqual({ ids: ["a1", "a2"], truncated: false });

    const big = new FakeShop();
    for (let p = 0; p < 30; p++) big.addProduct({ id: `gid://shopify/Product/${p}` }, Array.from({ length: 100 }, (_, i) => ({ id: `v${p}-${i}` })));
    const result = await fetchVariantIdsByFilter(big.gql, {});
    expect(result.truncated).toBe(true);
    expect(result.ids).toHaveLength(2000);
  });

  it("l'estimation de coût reproduit le refus de l'ancienne requête", () => {
    const old = `query Old($ids: [ID!]!) { nodes(ids: $ids) { ... on ProductVariant { id metafields(first: 25) { nodes { value } }
      product { id collections(first: 25) { nodes { id } } metafields(first: 25) { nodes { value } } } } } }`;
    expect(estimateQueryCost(old, { ids: Array.from({ length: 100 }, (_, i) => String(i)) })).toBe(8300);
  });

  // Sans métachamp, une variante coûte 2 points : 250 par appel (maximum de nodes)
  it("découpe les grosses sélections en appels de 250", async () => {
    const shop = new FakeShop();
    shop.addProduct({ id: "p" }, Array.from({ length: 600 }, (_, i) => ({ id: `v${i}` })));
    const items = await fetchVariantsForLabels(shop.gql, [...shop.variants.keys()]);
    expect(items).toHaveLength(600);
    expect(shop.calls.filter((c) => c.operation === "VariantsForLabels")).toHaveLength(3);
  });

  it("échappe les filtres saisis par le marchand", () => {
    expect(productSearchQuery({ vendor: 'Atelier "Lune"', collectionId: "gid://shopify/Collection/42", createdSince: "2026-10-01" })).toBe(
      'collection_id:42 AND vendor:"Atelier \\"Lune\\"" AND created_at:>=2026-10-01',
    );
    expect(productSearchQuery({ createdSince: "hier; DROP" })).toBe("");
  });
});
