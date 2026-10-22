import { describe, expect, it } from "vitest";
import { FakeShop } from "~/testing/fakeShop";
import { docKind, inventoryDocLines, listInventoryDocs } from "./inventoryDocs";

const PO = "gid://shopify/InventoryPurchaseOrder/1";
const TR = "gid://shopify/InventoryTransfer/2";

describe("bons de commande et transferts (F14)", () => {
  it("un bon de 200 variantes donne 200 lignes aux bonnes quantités", async () => {
    const s = new FakeShop();
    const lines = Array.from({ length: 300 }, (_, i) => ({ variantId: `v${i % 200}`, quantity: i < 200 ? (i % 5) + 1 : 0 }));
    s.inventoryDocs.set(PO, { name: "#PO1", status: "ORDERED", dateCreated: "2026-10-01", lines });
    const result = await inventoryDocLines(s.gql, PO);
    expect(result.name).toBe("#PO1");
    expect(result.lines).toHaveLength(200);
    expect(result.lines[7]).toEqual({ variantId: "v7", quantity: 3 });
    // 300 lignes : 2 pages de 250
    expect(s.calls.filter((c) => c.operation === "PurchaseOrderLines")).toHaveLength(2);
  });

  it("transfert : additionne les doublons, ignore les articles supprimés", async () => {
    const s = new FakeShop();
    s.inventoryDocs.set(TR, {
      name: "#T2", status: "READY_TO_SHIP", dateCreated: "2026-10-05",
      lines: [{ variantId: "a", quantity: 2 }, { variantId: null, quantity: 4 }, { variantId: "a", quantity: 1 }, { variantId: "b", quantity: 2000 }],
    });
    expect(await inventoryDocLines(s.gql, TR)).toEqual({
      name: "#T2", skipped: 1, lines: [{ variantId: "a", quantity: 3 }, { variantId: "b", quantity: 1000 }],
    });
  });

  it("liste les documents récents, les plus récents d'abord", async () => {
    const s = new FakeShop();
    s.inventoryDocs.set(PO, { name: "#PO1", status: "ORDERED", dateCreated: "2026-10-01", lines: [] });
    s.inventoryDocs.set(TR, { name: "#T2", status: "DRAFT", dateCreated: "2026-10-05", lines: [] });
    expect((await listInventoryDocs(s.gql)).map((d) => [d.name, d.kind])).toEqual([["#T2", "transfer"], ["#PO1", "purchase_order"]]);
  });

  it("refuse un identifiant qui n'est ni un bon ni un transfert", async () => {
    expect(docKind("gid://shopify/Product/1")).toBeNull();
    await expect(inventoryDocLines(new FakeShop().gql, "gid://shopify/Product/1")).rejects.toThrow();
    await expect(inventoryDocLines(new FakeShop().gql, PO)).rejects.toThrow(/introuvable/);
  });
});
