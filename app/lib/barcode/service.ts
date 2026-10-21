import { fetchCatalogBarcodes, writeBarcodes, type CatalogVariant } from "../shopify/catalog";
import type { Gql } from "../shopify/graphql";
import type { Symbology } from "./generate";
import { planBarcodes, type BarcodeAssignment, type PlanMode } from "./plan";
import { planGs1Import, type Gs1Row } from "./gs1";

// Stockage du compteur et du journal, séparé pour être testé sans base de données
export interface BarcodeStore {
  getCounter(shop: string): Promise<number>;
  // Avance le compteur seulement s'il vaut encore `expected` ; faux si une
  // autre génération est passée entre-temps
  compareAndSetCounter(shop: string, expected: number, next: number): Promise<boolean>;
  appendJournal(shop: string, batchId: string, reason: string, changes: BarcodeAssignment[]): Promise<void>;
  readJournal(shop: string, batchId: string): Promise<BarcodeAssignment[]>;
}

export interface GenerateResult {
  batchId: string;
  written: BarcodeAssignment[];
  keptCount: number;
}

const MAX_ATTEMPTS = 5;

// Génère et écrit les codes manquants (ou remplace, avec confirmation) pour les
// variantes demandées. Le catalogue entier est relu juste avant l'écriture.
export async function generateBarcodes(
  gql: Gql,
  store: BarcodeStore,
  shop: string,
  variantIds: string[],
  symbology: Symbology,
  mode: PlanMode = { kind: "missing" },
  newBatchId: () => string = () => crypto.randomUUID(),
): Promise<GenerateResult> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const catalog = await fetchCatalogBarcodes(gql);
    const wanted = new Set(variantIds);
    const targets = catalog.filter((v) => wanted.has(v.variantId));
    const start = await store.getCounter(shop);
    const plan = planBarcodes(targets, catalog, symbology, start, mode);

    // Réserve la plage de codes avant d'écrire : deux générations simultanées
    // ne peuvent pas attribuer le même code
    if (!(await store.compareAndSetCounter(shop, start, plan.nextCounter))) continue;

    const batchId = newBatchId();
    if (plan.assignments.length) {
      const productOf = new Map(catalog.map((v) => [v.variantId, v.productId]));
      // Journal d'abord : en cas d'échec en cours d'écriture, l'ancienne valeur reste connue
      await store.appendJournal(shop, batchId, mode.kind === "replace" ? "replace_confirmed" : "generated", plan.assignments);
      await writeBarcodes(
        gql,
        plan.assignments.map((a) => ({ variantId: a.variantId, productId: productOf.get(a.variantId)!, barcode: a.newValue })),
      );
    }
    return { batchId, written: plan.assignments, keptCount: plan.keptCount };
  }
  throw new Error("Trop de générations simultanées, réessayez.");
}

// Remet les anciennes valeurs d'un lot, sauf sur les variantes modifiées depuis
// (on ne défait jamais un changement fait ailleurs)
export async function rollbackBatch(gql: Gql, store: BarcodeStore, shop: string, batchId: string, newBatchId: () => string = () => crypto.randomUUID()) {
  const changes = await store.readJournal(shop, batchId);
  const catalog = new Map<string, CatalogVariant>((await fetchCatalogBarcodes(gql)).map((v) => [v.variantId, v]));
  const restorable = changes.filter((c) => catalog.get(c.variantId)?.barcode === c.newValue);
  const skipped = changes.length - restorable.length;
  const reverse: BarcodeAssignment[] = restorable.map((c) => ({
    variantId: c.variantId,
    oldValue: c.newValue,
    newValue: c.oldValue ?? "",
  }));
  const rollbackId = newBatchId();
  if (reverse.length) {
    await store.appendJournal(shop, rollbackId, "rollback", reverse);
    await writeBarcodes(
      gql,
      reverse.map((r) => ({ variantId: r.variantId, productId: catalog.get(r.variantId)!.productId, barcode: r.newValue })),
    );
  }
  return { restored: reverse.length, skipped, batchId: rollbackId };
}

// Import GS1 (F19) : relit le catalogue, vérifie, journalise puis écrit
export async function importGs1(
  gql: Gql,
  store: BarcodeStore,
  shop: string,
  rows: Gs1Row[],
  confirmation?: string,
  newBatchId: () => string = () => crypto.randomUUID(),
) {
  const catalog = await fetchCatalogBarcodes(gql);
  const plan = planGs1Import(rows, catalog, confirmation);
  const batchId = newBatchId();
  if (plan.assignments.length) {
    const productOf = new Map(catalog.map((v) => [v.variantId, v.productId]));
    await store.appendJournal(shop, batchId, "gtin_import", plan.assignments);
    await writeBarcodes(
      gql,
      plan.assignments.map((a) => ({ variantId: a.variantId, productId: productOf.get(a.variantId)!, barcode: a.newValue })),
    );
  }
  return { batchId, ...plan };
}
