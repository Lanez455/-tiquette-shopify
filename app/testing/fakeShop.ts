// Fausse boutique Shopify en mémoire pour les tests. Elle répond aux opérations
// GraphQL de l'app d'après leur nom, avec la pagination et les erreurs de l'API.
import type { Gql } from "~/lib/shopify/graphql";

export interface FakeVariant {
  id: string;
  productId: string;
  title: string;
  sku: string | null;
  barcode: string | null;
  price: string;
  compareAtPrice: string | null;
  inventoryQuantity: number;
  metafields?: { namespace: string; key: string; value: string }[];
}

export interface FakeProduct {
  id: string;
  title: string;
  vendor: string;
  productType: string;
  collectionIds: string[];
  metafields?: { namespace: string; key: string; value: string }[];
}

export class FakeShop {
  products = new Map<string, FakeProduct>();
  variants = new Map<string, FakeVariant>();
  calls: { operation: string; variables: Record<string, unknown> }[] = [];
  // Permet de simuler une panne sur une opération donnée
  failOn?: (operation: string, variables: Record<string, unknown>) => string | null;

  addProduct(product: Partial<FakeProduct> & { id: string }, variants: (Partial<FakeVariant> & { id: string })[]) {
    this.products.set(product.id, { title: "Produit", vendor: "", productType: "", collectionIds: [], ...product });
    for (const v of variants) {
      this.variants.set(v.id, {
        productId: product.id, title: "Default Title", sku: null, barcode: null, price: "10.00",
        compareAtPrice: null, inventoryQuantity: 0, ...v,
      });
    }
  }

  gql: Gql = async <T>(query: string, variables: Record<string, unknown> = {}) => {
    const operation = /(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? "anonymous";
    this.calls.push({ operation, variables });
    const failure = this.failOn?.(operation, variables);
    if (failure) throw new Error(failure);
    const handler = (this as unknown as Record<string, (v: Record<string, unknown>) => unknown>)[`op${operation}`];
    if (!handler) throw new Error(`Opération non simulée : ${operation}`);
    return handler.call(this, variables) as T;
  };

  opVariantBarcodes({ after }: Record<string, unknown>) {
    const all = [...this.variants.values()];
    const start = after ? Number(after) : 0;
    const page = all.slice(start, start + 250);
    return {
      productVariants: {
        nodes: page.map((v) => ({ id: v.id, barcode: v.barcode, sku: v.sku, product: { id: v.productId } })),
        pageInfo: { hasNextPage: start + 250 < all.length, endCursor: String(start + 250) },
      },
    };
  }

  opVariantsForLabels({ ids }: Record<string, unknown>) {
    if ((ids as string[]).length > 250) throw new Error("Trop d'identifiants dans un seul appel");
    return {
      nodes: (ids as string[]).map((id) => {
        const v = this.variants.get(id);
        if (!v) return null;
        const p = this.products.get(v.productId)!;
        return {
          ...v,
          metafields: { nodes: v.metafields ?? [] },
          product: {
            id: p.id, title: p.title, vendor: p.vendor, productType: p.productType,
            collections: { nodes: p.collectionIds.map((id) => ({ id })) },
            metafields: { nodes: p.metafields ?? [] },
          },
        };
      }),
    };
  }

  opProductVariantIds({ ids }: Record<string, unknown>) {
    return {
      nodes: (ids as string[]).map((id) => {
        if (this.products.has(id)) {
          return { id, variants: { nodes: [...this.variants.values()].filter((v) => v.productId === id).map((v) => ({ id: v.id })) } };
        }
        return this.variants.has(id) ? { id } : null;
      }),
    };
  }

  // Recherche « barcode:"x" OR sku:"y" », insensible à la casse comme Shopify
  opVariantLookup({ query }: Record<string, unknown>) {
    const terms = [...String(query).matchAll(/(barcode|sku):"((?:[^"\\]|\\.)*)"/g)].map((m) => ({
      field: m[1] as "barcode" | "sku",
      value: m[2]!.replace(/\\(.)/g, "$1").toLowerCase(),
    }));
    const nodes = [...this.variants.entries()]
      .filter(([, v]) => terms.some((t) => (v[t.field] ?? "").toLowerCase() === t.value))
      .map(([id, v]) => ({ id, sku: v.sku, barcode: v.barcode }));
    return { productVariants: { nodes: nodes.slice(0, 250) } };
  }

  // Bons de commande et transferts : { id → nom, lignes }
  inventoryDocs = new Map<string, { name: string; status: string; dateCreated: string; lines: { variantId: string | null; quantity: number }[] }>();

  private docPage(id: unknown, after: unknown) {
    const doc = this.inventoryDocs.get(String(id));
    if (!doc) return null;
    const start = after ? Number(after) : 0;
    const page = doc.lines.slice(start, start + 250);
    return {
      name: doc.name,
      lineItems: {
        nodes: page.map((l) => ({ totalQuantity: l.quantity, inventoryItem: l.variantId ? { variant: { id: l.variantId } } : { variant: null } })),
        pageInfo: { hasNextPage: start + 250 < doc.lines.length, endCursor: String(start + 250) },
      },
    };
  }

  opPurchaseOrderLines({ id, after }: Record<string, unknown>) {
    return { inventoryPurchaseOrder: String(id).includes("InventoryPurchaseOrder") ? this.docPage(id, after) : null };
  }

  opTransferLines({ id, after }: Record<string, unknown>) {
    return { inventoryTransfer: String(id).includes("InventoryTransfer") ? this.docPage(id, after) : null };
  }

  opRecentInventoryDocs() {
    const nodes = (kind: string) =>
      [...this.inventoryDocs].filter(([id]) => id.includes(kind)).map(([id, d]) => ({ id, name: d.name, status: d.status, dateCreated: d.dateCreated }));
    return { inventoryPurchaseOrders: { nodes: nodes("InventoryPurchaseOrder/") }, inventoryTransfers: { nodes: nodes("InventoryTransfer/") } };
  }

  // Stock par magasin : « inventoryItemId|locationId » → disponible
  stock = new Map<string, number>();
  locations = [{ id: "gid://shopify/Location/1", name: "Boutique", isActive: true }];
  untracked = new Set<string>();
  usedKeys = new Map<string, unknown>();
  // Simule une vente au même moment : modifie le stock juste avant l'ajustement
  beforeAdjust?: () => void;

  opReceivingLocations() {
    return { locations: { nodes: this.locations } };
  }

  opScanLookup({ query }: Record<string, unknown>) {
    const found = this.opVariantLookup({ query }).productVariants.nodes;
    return {
      productVariants: {
        nodes: found.map((n) => ({ ...n, displayName: this.variants.get(n.id)!.title, inventoryItem: { id: `item-${n.id}` } })),
      },
    };
  }

  opInventoryAvailable({ id, locationId }: Record<string, unknown>) {
    const key = `${id}|${locationId}`;
    if (!String(id).startsWith("item-")) return { inventoryItem: null };
    return {
      inventoryItem: {
        tracked: !this.untracked.has(String(id)),
        inventoryLevel: this.stock.has(key) ? { quantities: [{ name: "available", quantity: this.stock.get(key)! }] } : null,
      },
    };
  }

  opReceiveAdjust({ input, idempotencyKey }: Record<string, unknown>) {
    const key = String(idempotencyKey);
    if (this.usedKeys.has(key)) return this.usedKeys.get(key);
    this.beforeAdjust?.();
    const { changes } = input as { changes: { delta: number; inventoryItemId: string; locationId: string; changeFromQuantity: number }[] };
    for (const c of changes) {
      const stockKey = `${c.inventoryItemId}|${c.locationId}`;
      const current = this.stock.get(stockKey) ?? 0;
      if (current !== c.changeFromQuantity) {
        return { inventoryAdjustQuantities: { userErrors: [{ field: ["changeFromQuantity"], message: "The specified changeFromQuantity is stale", code: "CHANGE_FROM_QUANTITY_STALE" }] } };
      }
      this.stock.set(stockKey, current + c.delta);
    }
    const result = { inventoryAdjustQuantities: { userErrors: [] } };
    this.usedKeys.set(key, result);
    return result;
  }

  opShopFormat() {
    return { shop: { currencyCode: "EUR" }, shopLocales: [{ locale: "fr", primary: true }] };
  }

  opUpdateBarcodes({ productId, variants }: Record<string, unknown>) {
    const userErrors: { field: string[]; message: string }[] = [];
    for (const input of variants as { id: string; barcode: string }[]) {
      const v = this.variants.get(input.id);
      if (!v || v.productId !== productId) {
        userErrors.push({ field: ["variants"], message: `Variante ${input.id} absente du produit` });
        continue;
      }
      v.barcode = input.barcode === "" ? null : input.barcode;
    }
    return { productVariantsBulkUpdate: { productVariants: [], userErrors } };
  }
}
