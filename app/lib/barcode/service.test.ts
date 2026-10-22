import { beforeEach, describe, expect, it } from "vitest";
import { FakeShop } from "~/testing/fakeShop";
import { isValidGtin } from "./checksum";
import { ConfirmationRequiredError, findDuplicates, replaceConfirmationPhrase } from "./plan";
import { generateBarcodes, rollbackBatch, type BarcodeStore } from "./service";
import type { BarcodeAssignment } from "./plan";

function memoryStore(): BarcodeStore & { journal: Map<string, BarcodeAssignment[]>; counter: number } {
  const journal = new Map<string, BarcodeAssignment[]>();
  const store = {
    journal,
    counter: 1,
    async getCounter() { return store.counter; },
    async compareAndSetCounter(_shop: string, expected: number, next: number) {
      if (store.counter !== expected) return false;
      store.counter = next;
      return true;
    },
    async appendJournal(_shop: string, batchId: string, _reason: string, changes: BarcodeAssignment[]) {
      journal.set(batchId, [...(journal.get(batchId) ?? []), ...changes]);
    },
    async readJournal(_shop: string, batchId: string) { return journal.get(batchId) ?? []; },
  };
  return store;
}

let shop: FakeShop;
let store: ReturnType<typeof memoryStore>;
let n = 0;
const ids = () => `batch-${++n}`;

beforeEach(() => {
  shop = new FakeShop();
  store = memoryStore();
  shop.addProduct({ id: "p1" }, [
    { id: "v1", barcode: "4006381333931" }, // code fabricant
    { id: "v2" },
    { id: "v3" },
  ]);
  shop.addProduct({ id: "p2" }, [{ id: "v4" }]);
});

describe("génération dans la boutique (F10, F11)", () => {
  it("écrit les codes manquants, sans toucher au code fabricant", async () => {
    const result = await generateBarcodes(shop.gql, store, "s", ["v1", "v2", "v3", "v4"], "ean13", undefined, ids);
    expect(result.written.map((w) => w.variantId)).toEqual(["v2", "v3", "v4"]);
    expect(shop.variants.get("v1")!.barcode).toBe("4006381333931");
    for (const id of ["v2", "v3", "v4"]) expect(isValidGtin(shop.variants.get(id)!.barcode!)).toBe(true);
    // Un seul appel d'écriture par produit
    expect(shop.calls.filter((c) => c.operation === "UpdateBarcodes")).toHaveLength(2);
  });

  it("ne réutilise jamais un code entre deux générations", async () => {
    await generateBarcodes(shop.gql, store, "s", ["v2"], "ean13", undefined, ids);
    shop.addProduct({ id: "p3" }, [{ id: "v5" }]);
    await generateBarcodes(shop.gql, store, "s", ["v3", "v4", "v5"], "ean13", undefined, ids);
    const all = [...shop.variants.values()].map((v) => ({ variantId: v.id, barcode: v.barcode }));
    expect(findDuplicates(all).size).toBe(0);
  });

  it("refuse le remplacement sans confirmation et n'écrit rien", async () => {
    await expect(
      generateBarcodes(shop.gql, store, "s", ["v1"], "ean13", { kind: "replace", confirmation: "" }, ids),
    ).rejects.toThrow(ConfirmationRequiredError);
    expect(shop.calls.some((c) => c.operation === "UpdateBarcodes")).toBe(false);
    expect(store.counter).toBe(1);
  });

  it("recommence si une autre génération a avancé le compteur entre-temps", async () => {
    const original = store.compareAndSetCounter;
    let first = true;
    store.compareAndSetCounter = async (s, expected, next) => {
      if (first) {
        first = false;
        store.counter = expected + 5; // une autre génération est passée
        return false;
      }
      return original(s, expected, next);
    };
    const result = await generateBarcodes(shop.gql, store, "s", ["v2"], "ean13", undefined, ids);
    expect(result.written).toHaveLength(1);
    expect(store.counter).toBe(7);
  });

  it("garde le journal si l'écriture Shopify échoue", async () => {
    shop.failOn = (op) => (op === "UpdateBarcodes" ? "Shopify indisponible" : null);
    await expect(generateBarcodes(shop.gql, store, "s", ["v2"], "ean13", undefined, () => "lot-panne")).rejects.toThrow();
    expect(store.journal.get("lot-panne")).toHaveLength(1);
  });
});

describe("retour arrière", () => {
  it("restaure les anciennes valeurs d'un remplacement confirmé", async () => {
    const result = await generateBarcodes(
      shop.gql, store, "s", ["v1", "v2"], "ean13",
      { kind: "replace", confirmation: replaceConfirmationPhrase(1) }, () => "lot-1",
    );
    expect(shop.variants.get("v1")!.barcode).not.toBe("4006381333931");
    const back = await rollbackBatch(shop.gql, store, "s", result.batchId, ids);
    expect(back).toMatchObject({ restored: 2, skipped: 0 });
    expect(shop.variants.get("v1")!.barcode).toBe("4006381333931");
    expect(shop.variants.get("v2")!.barcode).toBeNull();
  });

  it("ne défait pas une variante modifiée ailleurs depuis", async () => {
    const result = await generateBarcodes(shop.gql, store, "s", ["v2", "v3"], "ean13", undefined, () => "lot-2");
    shop.variants.get("v2")!.barcode = "036000291452"; // modifié à la main dans Shopify
    const back = await rollbackBatch(shop.gql, store, "s", result.batchId, ids);
    expect(back).toMatchObject({ restored: 1, skipped: 1 });
    expect(shop.variants.get("v2")!.barcode).toBe("036000291452");
  });
});

describe("catalogue volumineux", () => {
  it("lit les 1 200 variantes sur plusieurs pages et n'oublie aucun code", async () => {
    const big = new FakeShop();
    for (let p = 0; p < 300; p++) {
      big.addProduct({ id: `p${p}` }, Array.from({ length: 4 }, (_, i) => ({ id: `v${p}-${i}` })));
    }
    const all = [...big.variants.keys()];
    const result = await generateBarcodes(big.gql, memoryStore(), "s", all, "code128", undefined, ids);
    expect(result.written).toHaveLength(1200);
    expect(big.calls.filter((c) => c.operation === "VariantBarcodes")).toHaveLength(5);
    const codes = [...big.variants.values()].map((v) => ({ variantId: v.id, barcode: v.barcode }));
    expect(findDuplicates(codes).size).toBe(0);
  });
});
