import { describe, expect, it } from "vitest";
import { FakeShop } from "~/testing/fakeShop";
import { withCheckDigit } from "./checksum";
import { checkGtin, parseGs1Input, planGs1Import } from "./gs1";
import { ConfirmationRequiredError, type BarcodeAssignment } from "./plan";
import { importGs1, type BarcodeStore } from "./service";

// GTIN d'un préfixe d'entreprise français fictif (376…)
const gtin = (n: number) => withCheckDigit(`376123${String(n).padStart(6, "0")}`);

function memoryStore(): BarcodeStore & { journal: Map<string, { reason: string; changes: BarcodeAssignment[] }> } {
  const journal = new Map<string, { reason: string; changes: BarcodeAssignment[] }>();
  return {
    journal,
    async getCounter() { return 1; },
    async compareAndSetCounter() { return true; },
    async appendJournal(_s, batchId, reason, changes) { journal.set(batchId, { reason, changes }); },
    async readJournal(_s, batchId) { return journal.get(batchId)?.changes ?? []; },
  };
}

describe("contrôle des GTIN (F19)", () => {
  it("accepte un vrai GTIN, refuse clé fausse, longueur, lettres et codes internes", () => {
    expect(checkGtin(` ${gtin(1).slice(0, 4)}-${gtin(1).slice(4)} `)).toEqual({ ok: true, gtin: gtin(1) });
    const wrong = gtin(1).slice(0, 12) + ((Number(gtin(1).at(-1)) + 1) % 10);
    expect(checkGtin(wrong)).toMatchObject({ ok: false, reason: expect.stringMatching(/Clé/) });
    expect(checkGtin("12345")).toMatchObject({ ok: false, reason: expect.stringMatching(/5 chiffres/) });
    expect(checkGtin("ABC")).toMatchObject({ ok: false });
    expect(checkGtin(withCheckDigit("200000000001"))).toMatchObject({ ok: false, reason: expect.stringMatching(/interne/) });
    expect(checkGtin(withCheckDigit("40000000001"))).toMatchObject({ ok: false, reason: expect.stringMatching(/interne/) });
    expect(checkGtin("036000291452")).toEqual({ ok: true, gtin: "036000291452" });
  });

  it("500 GTIN importés : clés vérifiées, aucun créé par l'app", async () => {
    const shop = new FakeShop();
    shop.addProduct({ id: "p" }, Array.from({ length: 520 }, (_, i) => ({ id: `v${i}`, barcode: i < 20 ? `LB${i}` : null })));
    const list = Array.from({ length: 500 }, (_, i) => gtin(i)).join("\n");
    const { rows, errors } = parseGs1Input(`GTIN\n${list}`);
    expect(errors).toEqual([]);
    const store = memoryStore();
    const result = await importGs1(shop.gql, store, "s", rows, undefined, () => "b1");
    expect(result.assignments).toHaveLength(500);
    const written = [...shop.variants.values()].map((v) => v.barcode).filter((b) => b && !b.startsWith("LB"));
    expect(new Set(written)).toEqual(new Set(rows.map((r) => r.gtin)));
    expect(store.journal.get("b1")!.reason).toBe("gtin_import");
  });
});

describe("attribution des GTIN", () => {
  const catalog = [
    { variantId: "gid://shopify/ProductVariant/1", barcode: null, sku: "PULL-M" },
    { variantId: "gid://shopify/ProductVariant/2", barcode: "2000000000015", sku: "PULL-L" },
    { variantId: "gid://shopify/ProductVariant/3", barcode: null, sku: "BONNET" },
    { variantId: "gid://shopify/ProductVariant/4", barcode: gtin(9), sku: "DOUBLE" },
    { variantId: "gid://shopify/ProductVariant/5", barcode: null, sku: "double" },
  ];

  it("par SKU ou ID ; un code existant demande la confirmation", () => {
    const { rows } = parseGs1Input(`sku;gtin\npull-m;${gtin(1)}\nPULL-L;${gtin(2)}\n3;${gtin(3)}`);
    expect(() => planGs1Import(rows, catalog)).toThrow(ConfirmationRequiredError);
    const plan = planGs1Import(rows, catalog, "REMPLACER 1");
    expect(plan.assignments).toEqual([
      { variantId: "gid://shopify/ProductVariant/1", oldValue: null, newValue: gtin(1) },
      { variantId: "gid://shopify/ProductVariant/2", oldValue: "2000000000015", newValue: gtin(2) },
      { variantId: "gid://shopify/ProductVariant/3", oldValue: null, newValue: gtin(3) },
    ]);
  });

  it("refuse un GTIN déjà utilisé, un SKU ambigu ou inconnu, deux GTIN pour une variante", () => {
    const { rows } = parseGs1Input(`sku;gtin\nPULL-M;${gtin(9)}\nDOUBLE;${gtin(4)}\nINCONNU;${gtin(5)}\nBONNET;${gtin(6)}\nBONNET;${gtin(7)}`);
    const plan = planGs1Import(rows, catalog);
    expect(plan.assignments.map((a) => a.newValue)).toEqual([gtin(6)]);
    expect(plan.problems.map((p) => p.line)).toEqual([2, 3, 4, 6]);
  });

  it("GTIN libres : seulement aux variantes sans code ; le surplus reste au marchand", () => {
    const { rows } = parseGs1Input([gtin(1), gtin(2), gtin(3), gtin(4)].join("\n"));
    const plan = planGs1Import(rows, catalog);
    expect(plan.assignments.map((a) => a.variantId)).toEqual([1, 3, 5].map((n) => `gid://shopify/ProductVariant/${n}`));
    expect(plan.unused).toEqual([gtin(4)]);
  });

  it("le fichier signale ses propres erreurs : doublons et clés fausses", () => {
    const bad = gtin(2).slice(0, 12) + ((Number(gtin(2).at(-1)) + 3) % 10);
    const { rows, errors } = parseGs1Input(`gtin\n${gtin(1)}\n${gtin(1)}\n${bad}\n\n`);
    expect(rows).toHaveLength(1);
    expect(errors.map((e) => e.line)).toEqual([3, 4]);
  });
});
