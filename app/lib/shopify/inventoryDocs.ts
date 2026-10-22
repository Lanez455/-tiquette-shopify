import type { PrintLine } from "../print/job";
import { MAX_PER_LINE } from "../print/job";
import type { Gql } from "./graphql";

// Bons de commande fournisseur et transferts de stock (F14).
// Champs vérifiés sur la référence de l'API Admin 2026-10 :
// InventoryPurchaseOrder (name, status, dateCreated, lineItems) et
// InventoryTransfer (name, status, dateCreated, totalQuantity, lineItems),
// leurs lignes portant totalQuantity et inventoryItem.

export interface InventoryDoc {
  id: string;
  kind: "purchase_order" | "transfer";
  name: string;
  status: string;
  dateCreated: string | null;
}

const RECENT_DOCS = `#graphql
  query RecentInventoryDocs {
    inventoryPurchaseOrders(last: 25) {
      nodes { id name status dateCreated }
    }
    inventoryTransfers(first: 25, reverse: true) {
      nodes { id name status dateCreated }
    }
  }`;

type DocNode = { id: string; name: string; status: string; dateCreated: string | null };

// Les plus récents d'abord ; une boutique sans bons de commande renvoie une liste vide
export async function listInventoryDocs(gql: Gql): Promise<InventoryDoc[]> {
  const data = await gql<{ inventoryPurchaseOrders: { nodes: DocNode[] }; inventoryTransfers: { nodes: DocNode[] } }>(RECENT_DOCS);
  const docs = [
    ...data.inventoryPurchaseOrders.nodes.map((n) => ({ ...n, kind: "purchase_order" as const })),
    ...data.inventoryTransfers.nodes.map((n) => ({ ...n, kind: "transfer" as const })),
  ];
  return docs.sort((a, b) => (b.dateCreated ?? "").localeCompare(a.dateCreated ?? ""));
}

const LINE_FIELDS = `
  nodes { totalQuantity inventoryItem { variant { id } } }
  pageInfo { hasNextPage endCursor }`;

const PURCHASE_ORDER_LINES = `#graphql
  query PurchaseOrderLines($id: ID!, $after: String) {
    inventoryPurchaseOrder(id: $id) {
      name
      lineItems(first: 250, after: $after) {${LINE_FIELDS}
      }
    }
  }`;

const TRANSFER_LINES = `#graphql
  query TransferLines($id: ID!, $after: String) {
    inventoryTransfer(id: $id) {
      name
      lineItems(first: 250, after: $after) {${LINE_FIELDS}
      }
    }
  }`;

interface LinePage {
  name: string;
  lineItems: {
    nodes: { totalQuantity: number; inventoryItem: { variant: { id: string } | null } | null }[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
}

export const docKind = (id: string): InventoryDoc["kind"] | null =>
  id.startsWith("gid://shopify/InventoryPurchaseOrder/") ? "purchase_order" : id.startsWith("gid://shopify/InventoryTransfer/") ? "transfer" : null;

// Une ligne d'étiquettes par article du document, à la quantité prévue
export async function inventoryDocLines(gql: Gql, id: string): Promise<{ name: string; lines: PrintLine[]; skipped: number }> {
  const kind = docKind(id);
  if (!kind) throw new Error("Document inconnu");
  const totals = new Map<string, number>();
  let skipped = 0;
  let name = "";
  let after: string | null = null;
  do {
    const data: Record<string, LinePage | null> = await gql(kind === "purchase_order" ? PURCHASE_ORDER_LINES : TRANSFER_LINES, { id, after });
    const doc = data[kind === "purchase_order" ? "inventoryPurchaseOrder" : "inventoryTransfer"];
    if (!doc) throw new Error("Document introuvable");
    name = doc.name;
    for (const item of doc.lineItems.nodes) {
      const variantId = item.inventoryItem?.variant?.id;
      // Article supprimé depuis : rien à étiqueter
      if (!variantId) { skipped++; continue; }
      totals.set(variantId, (totals.get(variantId) ?? 0) + Math.max(0, item.totalQuantity));
    }
    after = doc.lineItems.pageInfo.hasNextPage ? doc.lineItems.pageInfo.endCursor : null;
  } while (after);
  const lines = [...totals].map(([variantId, quantity]) => ({ variantId, quantity: Math.min(quantity, MAX_PER_LINE) }));
  return { name, lines, skipped };
}
