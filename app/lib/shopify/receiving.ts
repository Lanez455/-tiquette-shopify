import type { Gql } from "./graphql";
import { ShopifyUserError } from "./graphql";

// Réception par scan (F18) : chaque article scanné ajoute 1 au stock du
// magasin choisi et place son étiquette dans la file.

export interface ScannedVariant {
  variantId: string;
  inventoryItemId: string;
  name: string;
  barcode: string | null;
  sku: string | null;
}

const LOCATIONS = `#graphql
  query ReceivingLocations {
    locations(first: 50) { nodes { id name isActive } }
  }`;

export async function listLocations(gql: Gql): Promise<{ id: string; name: string }[]> {
  const data = await gql<{ locations: { nodes: { id: string; name: string; isActive: boolean }[] } }>(LOCATIONS);
  return data.locations.nodes.filter((l) => l.isActive).map(({ id, name }) => ({ id, name }));
}

const SCAN_LOOKUP = `#graphql
  query ScanLookup($query: String!) {
    productVariants(first: 10, query: $query) {
      nodes { id sku barcode displayName inventoryItem { id } }
    }
  }`;

const quote = (value: string) => `"${value.replace(/["\\]/g, "\\$&")}"`;

export class ScanError extends Error {}

// Le code lu par la douchette : code-barres d'abord, sinon SKU
export async function findScannedVariant(gql: Gql, rawCode: string): Promise<ScannedVariant> {
  const code = rawCode.trim();
  if (!code || code.length > 100) throw new ScanError("Code illisible");
  const variants = [`barcode:${quote(code)}`, `sku:${quote(code)}`];
  // Une douchette lit parfois un UPC-A en EAN-13 avec un 0 devant, ou l'inverse
  if (/^0\d{12}$/.test(code)) variants.push(`barcode:${quote(code.slice(1))}`);
  if (/^\d{12}$/.test(code)) variants.push(`barcode:${quote("0" + code)}`);
  const data = await gql<{
    productVariants: { nodes: { id: string; sku: string | null; barcode: string | null; displayName: string; inventoryItem: { id: string } | null }[] };
  }>(SCAN_LOOKUP, { query: variants.join(" OR ") });
  const strip = (s: string) => s.replace(/^0+/, "").toLowerCase();
  const nodes = data.productVariants.nodes;
  const byBarcode = nodes.filter((n) => n.barcode && strip(n.barcode) === strip(code));
  const matches = byBarcode.length ? byBarcode : nodes.filter((n) => n.sku && n.sku.trim().toLowerCase() === code.toLowerCase());
  if (!matches.length) throw new ScanError(`Aucun article pour le code ${code}`);
  if (matches.length > 1) throw new ScanError(`${matches.length} articles portent le code ${code} : corrigez les doublons dans Codes-barres`);
  const v = matches[0]!;
  if (!v.inventoryItem) throw new ScanError("Cet article n'a pas de stock suivi");
  return { variantId: v.id, inventoryItemId: v.inventoryItem.id, name: v.displayName, barcode: v.barcode, sku: v.sku };
}

const AVAILABLE = `#graphql
  query InventoryAvailable($id: ID!, $locationId: ID!) {
    inventoryItem(id: $id) {
      tracked
      inventoryLevel(locationId: $locationId) { quantities(names: ["available"]) { name quantity } }
    }
  }`;

// Depuis la version 2026-04, la clé d'idempotence est obligatoire : un scan
// renvoyé deux fois (double clic, réseau lent) ne compte qu'une fois.
const ADJUST = `#graphql
  mutation ReceiveAdjust($input: InventoryAdjustQuantitiesInput!, $idempotencyKey: String!) {
    inventoryAdjustQuantities(input: $input) @idempotent(key: $idempotencyKey) {
      inventoryAdjustmentGroup { changes { name delta } }
      userErrors { field message code }
    }
  }`;

async function available(gql: Gql, inventoryItemId: string, locationId: string): Promise<number> {
  const data = await gql<{
    inventoryItem: { tracked: boolean; inventoryLevel: { quantities: { name: string; quantity: number }[] } | null } | null;
  }>(AVAILABLE, { id: inventoryItemId, locationId });
  if (!data.inventoryItem) throw new ScanError("Article introuvable");
  if (!data.inventoryItem.tracked) throw new ScanError("Le suivi du stock est désactivé pour cet article");
  if (!data.inventoryItem.inventoryLevel) throw new ScanError("Cet article n'est pas stocké dans ce magasin");
  return data.inventoryItem.inventoryLevel.quantities.find((q) => q.name === "available")?.quantity ?? 0;
}

// Ajoute (ou retire, pour annuler) une unité. changeFromQuantity protège d'une
// vente faite au même moment : en cas d'écart, on relit le stock et on réessaie.
export async function adjustStock(
  gql: Gql,
  args: { inventoryItemId: string; locationId: string; delta: 1 | -1; idempotencyKey: string },
): Promise<number> {
  if (!/^[\w-]{8,64}$/.test(args.idempotencyKey)) throw new ScanError("Clé de scan invalide");
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await available(gql, args.inventoryItemId, args.locationId);
    const data = await gql<{
      inventoryAdjustQuantities: { userErrors: { field?: string[] | null; message: string; code?: string | null }[] };
    }>(ADJUST, {
      idempotencyKey: `${args.idempotencyKey}-${attempt}`,
      input: {
        reason: args.delta > 0 ? "received" : "correction",
        name: "available",
        changes: [{ delta: args.delta, inventoryItemId: args.inventoryItemId, locationId: args.locationId, changeFromQuantity: current }],
      },
    });
    const errors = data.inventoryAdjustQuantities.userErrors;
    if (!errors.length) return current + args.delta;
    const stale = errors.some((e) => e.code === "CHANGE_FROM_QUANTITY_STALE" || /change.?from.?quantity/i.test(e.message));
    if (!stale) throw new ShopifyUserError(errors);
  }
  throw new ScanError("Le stock change trop vite : réessayez");
}
