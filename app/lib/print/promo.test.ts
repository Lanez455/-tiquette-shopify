import { describe, expect, it } from "vitest";
import { FakeShop } from "~/testing/fakeShop";
import { fetchCurrentPrices, findPriceChanges, setCompareAtPrices } from "./promo";

const at = new Date("2026-10-01");

describe("réétiquetage des promotions (F21)", () => {
  it("après le changement de prix de 10 produits, les 10 apparaissent", async () => {
    const shop = new FakeShop();
    for (let i = 0; i < 30; i++) shop.addProduct({ id: `p${i}`, title: `Produit ${String(i).padStart(2, "0")}` }, [{ id: `v${i}`, price: "20.00" }]);
    const printed = [...shop.variants.keys()].map((variantId) => ({ variantId, price: "20.00", compareAtPrice: null, printedAt: at }));
    for (let i = 0; i < 10; i++) shop.variants.get(`v${i * 3}`)!.price = i % 2 ? "25.00" : "15.00";
    const changes = findPriceChanges(printed, await fetchCurrentPrices(shop.gql, printed.map((p) => p.variantId)));
    expect(changes).toHaveLength(10);
    expect(changes.filter((c) => c.suggestedCompareAt === "20.00")).toHaveLength(5);
  });

  it("ignore les écritures différentes d'un même prix et les variantes supprimées", () => {
    const printed = [
      { variantId: "a", price: "20", compareAtPrice: null, printedAt: at },
      { variantId: "b", price: "10.00", compareAtPrice: null, printedAt: at },
    ];
    expect(findPriceChanges(printed, [{ variantId: "a", name: "A", price: "20.00", compareAtPrice: "" }])).toEqual([]);
  });

  it("une hausse ou un prix déjà barré : pas de prix barré proposé", () => {
    const printed = [
      { variantId: "a", price: "20.00", compareAtPrice: null, printedAt: at },
      { variantId: "b", price: "20.00", compareAtPrice: null, printedAt: at },
    ];
    const changes = findPriceChanges(printed, [
      { variantId: "a", name: "A", price: "22.00", compareAtPrice: null },
      { variantId: "b", name: "B", price: "15.00", compareAtPrice: "30.00" },
    ]);
    expect(changes.map((c) => c.suggestedCompareAt)).toEqual([null, null]);
  });

  it("pose l'ancien prix en prix barré, produit par produit", async () => {
    const shop = new FakeShop();
    shop.addProduct({ id: "p1" }, [{ id: "v1", price: "15.00" }, { id: "v2", price: "15.00" }]);
    shop.addProduct({ id: "p2" }, [{ id: "v3", price: "8.00" }]);
    await setCompareAtPrices(shop.gql, [
      { variantId: "v1", compareAtPrice: "20.00" },
      { variantId: "v2", compareAtPrice: "20.00" },
      { variantId: "v3", compareAtPrice: "10.00" },
    ]);
    expect([...shop.variants.values()].map((v) => v.compareAtPrice)).toEqual(["20.00", "20.00", "10.00"]);
    expect(shop.calls.filter((c) => c.operation === "SetCompareAt")).toHaveLength(2);
  });
});
