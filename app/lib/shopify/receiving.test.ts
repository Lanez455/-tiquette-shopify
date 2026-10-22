import { describe, expect, it } from "vitest";
import { FakeShop } from "~/testing/fakeShop";
import { adjustStock, findScannedVariant, listLocations, ScanError } from "./receiving";

const LOC = "gid://shopify/Location/1";

function shop() {
  const s = new FakeShop();
  s.addProduct({ id: "p1", title: "Pull" }, [
    { id: "v1", title: "Pull M", barcode: "2000000000015", sku: "PULL-M" },
    { id: "v2", title: "Pull L", barcode: "012345678905", sku: "PULL-L" },
    { id: "v3", title: "Bonnet", barcode: "2000000000022" },
    { id: "v4", title: "Bonnet bis", barcode: "2000000000022" },
  ]);
  s.stock.set(`item-v1|${LOC}`, 5);
  s.stock.set(`item-v2|${LOC}`, 0);
  return s;
}

describe("réception par scan (F18)", () => {
  it("20 articles scannés : stock augmenté de 20", async () => {
    const s = shop();
    for (let i = 0; i < 20; i++) {
      const v = await findScannedVariant(s.gql, "2000000000015");
      await adjustStock(s.gql, { inventoryItemId: v.inventoryItemId, locationId: LOC, delta: 1, idempotencyKey: `scan-000${i}` });
    }
    expect(s.stock.get(`item-v1|${LOC}`)).toBe(25);
  });

  it("le même scan renvoyé deux fois ne compte qu'une fois", async () => {
    const s = shop();
    const args = { inventoryItemId: "item-v1", locationId: LOC, delta: 1 as const, idempotencyKey: "scan-double" };
    await adjustStock(s.gql, args);
    await adjustStock(s.gql, args);
    expect(s.stock.get(`item-v1|${LOC}`)).toBe(6);
  });

  it("une vente au même moment : relit le stock et ne perd rien", async () => {
    const s = shop();
    let sold = false;
    s.beforeAdjust = () => {
      if (!sold) { sold = true; s.stock.set(`item-v1|${LOC}`, 4); }
    };
    expect(await adjustStock(s.gql, { inventoryItemId: "item-v1", locationId: LOC, delta: 1, idempotencyKey: "scan-vente" })).toBe(5);
    expect(s.stock.get(`item-v1|${LOC}`)).toBe(5);
  });

  it("annuler un scan retire 1", async () => {
    const s = shop();
    await adjustStock(s.gql, { inventoryItemId: "item-v1", locationId: LOC, delta: -1, idempotencyKey: "scan-annule" });
    expect(s.stock.get(`item-v1|${LOC}`)).toBe(4);
  });

  it("trouve par SKU, et un UPC lu en EAN-13", async () => {
    const s = shop();
    expect((await findScannedVariant(s.gql, " pull-m ")).variantId).toBe("v1");
    expect((await findScannedVariant(s.gql, "0012345678905")).variantId).toBe("v2");
  });

  it("messages clairs : inconnu, doublon, pas de stock dans ce magasin, suivi désactivé", async () => {
    const s = shop();
    await expect(findScannedVariant(s.gql, "999")).rejects.toThrow(/Aucun article/);
    await expect(findScannedVariant(s.gql, "2000000000022")).rejects.toThrow(/2 articles/);
    await expect(findScannedVariant(s.gql, "")).rejects.toThrow(ScanError);
    await expect(adjustStock(s.gql, { inventoryItemId: "item-v3", locationId: LOC, delta: 1, idempotencyKey: "scan-0001" })).rejects.toThrow(/pas stocké/);
    s.untracked.add("item-v1");
    await expect(adjustStock(s.gql, { inventoryItemId: "item-v1", locationId: LOC, delta: 1, idempotencyKey: "scan-0002" })).rejects.toThrow(/suivi/);
    await expect(adjustStock(s.gql, { inventoryItemId: "item-v1", locationId: LOC, delta: 1, idempotencyKey: "x" })).rejects.toThrow(/Clé/);
  });

  it("liste les magasins actifs", async () => {
    const s = shop();
    s.locations.push({ id: "gid://shopify/Location/2", name: "Fermé", isActive: false });
    expect(await listLocations(s.gql)).toEqual([{ id: LOC, name: "Boutique" }]);
  });
});
