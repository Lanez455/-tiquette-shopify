// Fausse boutique Shopify en mémoire pour les tests. Elle répond aux opérations
// GraphQL de l'app d'après leur nom, avec la pagination et les erreurs de l'API.
import { Kind, parse, type FieldNode, type SelectionSetNode } from "graphql";
import { estimateQueryCost, MAX_QUERY_COST } from "./queryCost";
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
  onlineStoreUrl?: string | null;
  // AAAA-MM-JJ, pour le filtre « ajoutés depuis »
  createdAt?: string;
}

// Champs aliasés d'une sélection : { alias → { champ, arguments } }
function aliasedFields(set: SelectionSetNode | undefined): Map<string, { name: string; args: Record<string, string> }> {
  const out = new Map<string, { name: string; args: Record<string, string> }>();
  for (const sel of set?.selections ?? []) {
    if (sel.kind === Kind.INLINE_FRAGMENT) for (const [k, v] of aliasedFields(sel.selectionSet)) out.set(k, v);
    if (sel.kind !== Kind.FIELD || !sel.alias) continue;
    const args: Record<string, string> = {};
    for (const a of sel.arguments ?? []) if (a.value.kind === Kind.STRING) args[a.name.value] = a.value.value;
    out.set(sel.alias.value, { name: sel.name.value, args });
  }
  return out;
}

function findField(set: SelectionSetNode | undefined, name: string): FieldNode | undefined {
  for (const sel of set?.selections ?? []) {
    if (sel.kind === Kind.FIELD && sel.name.value === name) return sel;
    if (sel.kind === Kind.INLINE_FRAGMENT) {
      const found = findField(sel.selectionSet, name);
      if (found) return found;
    }
  }
  return undefined;
}

// Recherche Shopify « champ:valeur AND champ:"valeur" »
function searchTerms(query: string): Record<string, string> {
  const terms: Record<string, string> = {};
  for (const m of query.matchAll(/(\w+):(>=)?("(?:[^"\\]|\\.)*"|[^\s]+)/g)) {
    const raw = m[3]!;
    terms[m[1]!] = raw.startsWith('"') ? raw.slice(1, -1).replace(/\\(.)/g, "$1") : raw;
  }
  return terms;
}

const lastSegment = (id: string) => id.split("/").pop()!;

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
    // Comme Shopify : une requête trop coûteuse est refusée en entier
    const cost = estimateQueryCost(query, variables);
    if (cost > MAX_QUERY_COST) throw new Error(`Query cost is ${cost}, which exceeds the single query max cost limit (${MAX_QUERY_COST}) : ${operation}`);
    const failure = this.failOn?.(operation, variables);
    if (failure) throw new Error(failure);
    const handler = (this as unknown as Record<string, (v: Record<string, unknown>, q: string) => unknown>)[`op${operation}`];
    if (!handler) throw new Error(`Opération non simulée : ${operation}`);
    return handler.call(this, variables, query) as T;
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

  // Répond aux alias demandés : mN: metafield(namespace, key) et cN: inCollection(id)
  opVariantsForLabels({ ids }: Record<string, unknown>, query: string) {
    if ((ids as string[]).length > 250) throw new Error("Trop d'identifiants dans un seul appel");
    const doc = parse(query);
    const root = doc.definitions[0]!.kind === Kind.OPERATION_DEFINITION ? doc.definitions[0].selectionSet : undefined;
    const variantSet = findField(root, "nodes")?.selectionSet;
    const productSet = findField(variantSet, "product")?.selectionSet;
    const resolve = (set: SelectionSetNode | undefined, owner: { metafields?: FakeVariant["metafields"] }, collectionIds: string[]) => {
      const out: Record<string, unknown> = {};
      for (const [alias, f] of aliasedFields(set)) {
        if (f.name === "metafield") {
          const m = owner.metafields?.find((x) => x.namespace === f.args.namespace && x.key === f.args.key);
          out[alias] = m ? { value: m.value } : null;
        } else if (f.name === "inCollection") {
          out[alias] = collectionIds.includes(f.args.id!);
        }
      }
      return out;
    };
    return {
      nodes: (ids as string[]).map((id) => {
        const v = this.variants.get(id);
        if (!v) return null;
        const p = this.products.get(v.productId)!;
        const { metafields: _m, ...fields } = v;
        return {
          ...fields,
          ...resolve(variantSet, v, []),
          product: {
            id: p.id, title: p.title, vendor: p.vendor, productType: p.productType,
            onlineStoreUrl: p.onlineStoreUrl ?? null,
            ...resolve(productSet, p, p.collectionIds),
          },
        };
      }),
    };
  }

  opNodeTypes({ ids }: Record<string, unknown>) {
    if ((ids as string[]).length > 250) throw new Error("Trop d'identifiants dans un seul appel");
    return {
      nodes: (ids as string[]).map((id) => {
        if (this.products.has(id)) return { __typename: "Product", id };
        return this.variants.has(id) ? { __typename: "ProductVariant", id } : null;
      }),
    };
  }

  // productVariants(query: "product_ids:1,2") avec pagination, ordre des produits puis des variantes
  opVariantsOfProducts({ query, after }: Record<string, unknown>) {
    const wanted = (searchTerms(String(query)).product_ids ?? "").split(",");
    const all = [...this.variants.values()].filter((v) => wanted.includes(lastSegment(v.productId)));
    const start = after ? Number(after) : 0;
    const page = all.slice(start, start + 250);
    return {
      productVariants: {
        nodes: page.map((v) => ({ id: v.id, product: { id: v.productId } })),
        pageInfo: { hasNextPage: start + 250 < all.length, endCursor: String(start + 250) },
      },
    };
  }

  opFilteredProducts({ query, after }: Record<string, unknown>) {
    const t = searchTerms(String(query));
    const all = [...this.products.values()].filter(
      (p) =>
        (!t.collection_id || p.collectionIds.some((c) => lastSegment(c) === t.collection_id)) &&
        (!t.vendor || p.vendor.toLowerCase() === t.vendor.toLowerCase()) &&
        (!t.product_type || p.productType.toLowerCase() === t.product_type.toLowerCase()) &&
        (!t.created_at || (p.createdAt ?? "") >= t.created_at),
    );
    const start = after ? Number(after) : 0;
    const page = all.slice(start, start + 250);
    return {
      products: {
        nodes: page.map((p) => ({ id: p.id })),
        pageInfo: { hasNextPage: start + 250 < all.length, endCursor: String(start + 250) },
      },
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

  opVariantPrices({ ids }: Record<string, unknown>) {
    return {
      nodes: (ids as string[]).map((id) => {
        const v = this.variants.get(id);
        return v ? { id, displayName: `${this.products.get(v.productId)!.title} - ${v.title}`, price: v.price, compareAtPrice: v.compareAtPrice } : null;
      }),
    };
  }

  opVariantProducts({ ids }: Record<string, unknown>) {
    return { nodes: (ids as string[]).map((id) => (this.variants.has(id) ? { id, product: { id: this.variants.get(id)!.productId } } : null)) };
  }

  opSetCompareAt({ productId, variants }: Record<string, unknown>) {
    for (const input of variants as { id: string; compareAtPrice: string }[]) {
      const v = this.variants.get(input.id);
      if (v && v.productId === productId) v.compareAtPrice = input.compareAtPrice;
    }
    return { productVariantsBulkUpdate: { userErrors: [] } };
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
