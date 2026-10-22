import type { Gql } from "../shopify/graphql";

// Réétiquetage des promotions (F21) : les variantes dont le prix a changé
// depuis leur dernière étiquette imprimée.

export interface PrintedPriceRow {
  variantId: string;
  price: string | null;
  compareAtPrice: string | null;
  printedAt: Date;
}

export interface CurrentPrice {
  variantId: string;
  name: string;
  price: string | null;
  compareAtPrice: string | null;
}

export interface PriceChange {
  variantId: string;
  name: string;
  printedPrice: string | null;
  price: string | null;
  compareAtPrice: string | null;
  printedAt: Date;
  // Baisse sans prix barré : l'ancien prix peut devenir le prix barré
  suggestedCompareAt: string | null;
}

const cents = (value: string | null) => (value == null || value === "" ? null : Math.round(Number(value) * 100));

export function findPriceChanges(printed: PrintedPriceRow[], current: CurrentPrice[]): PriceChange[] {
  const now = new Map(current.map((c) => [c.variantId, c]));
  const changes: PriceChange[] = [];
  for (const row of printed) {
    const cur = now.get(row.variantId);
    // Variante supprimée depuis : plus rien à étiqueter
    if (!cur) continue;
    if (cents(row.price) === cents(cur.price) && cents(row.compareAtPrice) === cents(cur.compareAtPrice)) continue;
    const old = cents(row.price);
    const fresh = cents(cur.price);
    const dropped = old != null && fresh != null && fresh < old;
    changes.push({
      variantId: row.variantId,
      name: cur.name,
      printedPrice: row.price,
      price: cur.price,
      compareAtPrice: cur.compareAtPrice,
      printedAt: row.printedAt,
      suggestedCompareAt: dropped && !cur.compareAtPrice ? row.price : null,
    });
  }
  return changes.sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

const VARIANT_PRICES = `#graphql
  query VariantPrices($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant { id displayName price compareAtPrice }
    }
  }`;

export async function fetchCurrentPrices(gql: Gql, ids: string[]): Promise<CurrentPrice[]> {
  const out: CurrentPrice[] = [];
  for (let i = 0; i < ids.length; i += 250) {
    const data = await gql<{ nodes: ({ id: string; displayName: string; price: string; compareAtPrice: string | null } | null)[] }>(
      VARIANT_PRICES,
      { ids: ids.slice(i, i + 250) },
    );
    for (const n of data.nodes) {
      if (n?.id) out.push({ variantId: n.id, name: n.displayName, price: n.price, compareAtPrice: n.compareAtPrice });
    }
  }
  return out;
}

const SET_COMPARE_AT = `#graphql
  mutation SetCompareAt($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      userErrors { field message }
    }
  }`;

const PRODUCT_OF = `#graphql
  query VariantProducts($ids: [ID!]!) {
    nodes(ids: $ids) { ... on ProductVariant { id product { id } } }
  }`;

// Pose l'ancien prix comme prix barré, sur demande explicite du marchand
export async function setCompareAtPrices(gql: Gql, changes: { variantId: string; compareAtPrice: string }[]): Promise<void> {
  if (!changes.length) return;
  const data = await gql<{ nodes: ({ id: string; product: { id: string } } | null)[] }>(PRODUCT_OF, { ids: changes.map((c) => c.variantId) });
  const productOf = new Map(data.nodes.filter(Boolean).map((n) => [n!.id, n!.product.id]));
  const byProduct = new Map<string, { id: string; compareAtPrice: string }[]>();
  for (const c of changes) {
    const productId = productOf.get(c.variantId);
    if (!productId) continue;
    byProduct.set(productId, [...(byProduct.get(productId) ?? []), { id: c.variantId, compareAtPrice: c.compareAtPrice }]);
  }
  for (const [productId, variants] of byProduct) {
    const result = await gql<{ productVariantsBulkUpdate: { userErrors: { message: string }[] } }>(SET_COMPARE_AT, { productId, variants });
    const errors = result.productVariantsBulkUpdate.userErrors;
    if (errors.length) throw new Error(errors.map((e) => e.message).join(" ; "));
  }
}
