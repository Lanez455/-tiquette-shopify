import type { LabelItem } from "../labels/template";
import { ShopifyUserError, type Gql } from "./graphql";

export interface CatalogVariant {
  variantId: string;
  productId: string;
  barcode: string | null;
  sku?: string | null;
}

const VARIANT_BARCODES = `#graphql
  query VariantBarcodes($after: String) {
    productVariants(first: 250, after: $after) {
      nodes { id barcode sku product { id } }
      pageInfo { hasNextPage endCursor }
    }
  }`;

interface VariantBarcodesData {
  productVariants: {
    nodes: { id: string; barcode: string | null; sku: string | null; product: { id: string } }[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
}

// Tous les codes du catalogue : l'unicité se vérifie sur la boutique entière (F10)
export async function fetchCatalogBarcodes(gql: Gql): Promise<CatalogVariant[]> {
  const result: CatalogVariant[] = [];
  let after: string | null = null;
  do {
    const data: VariantBarcodesData = await gql<VariantBarcodesData>(VARIANT_BARCODES, { after });
    for (const node of data.productVariants.nodes) {
      result.push({ variantId: node.id, productId: node.product.id, barcode: node.barcode, sku: node.sku });
    }
    after = data.productVariants.pageInfo.hasNextPage ? data.productVariants.pageInfo.endCursor : null;
  } while (after);
  return result;
}

const VARIANTS_FOR_LABELS = `#graphql
  query VariantsForLabels($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant {
        id
        title
        sku
        barcode
        price
        compareAtPrice
        inventoryQuantity
        metafields(first: 25) { nodes { namespace key value } }
        product {
          id
          title
          vendor
          productType
          collections(first: 25) { nodes { id } }
          metafields(first: 25) { nodes { namespace key value } }
        }
      }
    }
  }`;

interface MetafieldNodes {
  nodes: { namespace: string; key: string; value: string }[];
}

interface VariantNode {
  id: string;
  title: string;
  sku: string | null;
  barcode: string | null;
  price: string;
  compareAtPrice: string | null;
  inventoryQuantity: number | null;
  metafields: MetafieldNodes;
  product: {
    id: string;
    title: string;
    vendor: string;
    productType: string;
    collections: { nodes: { id: string }[] };
    metafields: MetafieldNodes;
  };
}

export interface LabelVariant extends LabelItem {
  variantId: string;
  productId: string;
  collectionIds: string[];
  inventoryQuantity: number | null;
}

// Les métachamps de la variante priment sur ceux du produit
function metafieldMap(product: MetafieldNodes, variant: MetafieldNodes): Record<string, string> {
  const map: Record<string, string> = {};
  for (const m of product.nodes) map[`product.${m.namespace}.${m.key}`] = m.value;
  for (const m of variant.nodes) map[`variant.${m.namespace}.${m.key}`] = m.value;
  return map;
}

const NODES_PER_CALL = 100;

export async function fetchVariantsForLabels(gql: Gql, ids: string[]): Promise<LabelVariant[]> {
  const unique = [...new Set(ids)];
  const byId = new Map<string, LabelVariant>();
  for (let i = 0; i < unique.length; i += NODES_PER_CALL) {
    const data = await gql<{ nodes: (VariantNode | null)[] }>(VARIANTS_FOR_LABELS, {
      ids: unique.slice(i, i + NODES_PER_CALL),
    });
    for (const v of data.nodes) {
      if (!v || !v.product) continue;
      byId.set(v.id, {
        variantId: v.id,
        productId: v.product.id,
        title: v.product.title,
        variantTitle: v.title,
        sku: v.sku,
        barcode: v.barcode,
        price: v.price,
        compareAtPrice: v.compareAtPrice,
        vendor: v.product.vendor,
        productType: v.product.productType,
        collectionIds: v.product.collections.nodes.map((c) => c.id),
        inventoryQuantity: v.inventoryQuantity,
        metafields: metafieldMap(v.product.metafields, v.metafields),
      });
    }
  }
  // Garde l'ordre demandé ; une variante supprimée entre-temps est ignorée
  return unique.flatMap((id) => byId.get(id) ?? []);
}

const UPDATE_BARCODES = `#graphql
  mutation UpdateBarcodes($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id barcode }
      userErrors { field message }
    }
  }`;

export interface BarcodeWrite {
  variantId: string;
  productId: string;
  barcode: string;
}

// Écrit les codes, un appel par produit. Une chaîne vide efface le code (retour arrière).
export async function writeBarcodes(gql: Gql, writes: BarcodeWrite[]): Promise<void> {
  const byProduct = new Map<string, BarcodeWrite[]>();
  for (const w of writes) byProduct.set(w.productId, [...(byProduct.get(w.productId) ?? []), w]);
  for (const [productId, group] of byProduct) {
    const data = await gql<{
      productVariantsBulkUpdate: { userErrors: { field: string[] | null; message: string }[] };
    }>(UPDATE_BARCODES, {
      productId,
      variants: group.map((w) => ({ id: w.variantId, barcode: w.barcode })),
    });
    if (data.productVariantsBulkUpdate.userErrors.length) {
      throw new ShopifyUserError(data.productVariantsBulkUpdate.userErrors);
    }
  }
}

const PRODUCT_VARIANT_IDS = `#graphql
  query ProductVariantIds($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product { id variants(first: 250) { nodes { id } } }
      ... on ProductVariant { id }
    }
  }`;

// Les extensions d'impression envoient des produits ou des variantes : tout devient variantes
export async function expandToVariantIds(gql: Gql, ids: string[]): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < ids.length; i += NODES_PER_CALL) {
    const data = await gql<{ nodes: ({ id: string; variants?: { nodes: { id: string }[] } } | null)[] }>(
      PRODUCT_VARIANT_IDS,
      { ids: ids.slice(i, i + NODES_PER_CALL) },
    );
    for (const node of data.nodes) {
      if (!node) continue;
      if (node.variants) out.push(...node.variants.nodes.map((v) => v.id));
      else out.push(node.id);
    }
  }
  return [...new Set(out)];
}

const SHOP_FORMAT = `#graphql
  query ShopFormat {
    shop { currencyCode }
    shopLocales(published: true) { locale primary }
  }`;

export async function fetchShopFormat(gql: Gql): Promise<{ currency: string; locale: string }> {
  const data = await gql<{ shop: { currencyCode: string }; shopLocales: { locale: string; primary: boolean }[] }>(SHOP_FORMAT);
  const locale = data.shopLocales.find((l) => l.primary)?.locale ?? "fr";
  return { currency: data.shop.currencyCode, locale };
}

export interface ProductFilter {
  collectionId?: string;
  vendor?: string;
  productType?: string;
  // Produits ajoutés depuis cette date (AAAA-MM-JJ)
  createdSince?: string;
}

const quote = (value: string) => `"${value.replace(/["\\]/g, "\\$&")}"`;

// Syntaxe de recherche de l'API Admin, avec les valeurs échappées
export function productSearchQuery(filter: ProductFilter): string {
  const parts: string[] = [];
  if (filter.collectionId) parts.push(`collection_id:${filter.collectionId.split("/").pop()!.replace(/\D/g, "")}`);
  if (filter.vendor) parts.push(`vendor:${quote(filter.vendor)}`);
  if (filter.productType) parts.push(`product_type:${quote(filter.productType)}`);
  if (filter.createdSince && /^\d{4}-\d{2}-\d{2}$/.test(filter.createdSince)) parts.push(`created_at:>=${filter.createdSince}`);
  return parts.join(" AND ");
}

const FILTERED_VARIANTS = `#graphql
  query FilteredVariants($query: String!, $after: String) {
    products(first: 100, after: $after, query: $query) {
      nodes { variants(first: 100) { nodes { id } } }
      pageInfo { hasNextPage endCursor }
    }
  }`;

export const MAX_FILTERED_VARIANTS = 2000;

// « Tout sélectionner » sur un filtre (F13), plafonné pour garder l'écran utilisable
export async function fetchVariantIdsByFilter(gql: Gql, filter: ProductFilter): Promise<{ ids: string[]; truncated: boolean }> {
  const query = productSearchQuery(filter);
  const ids: string[] = [];
  let after: string | null = null;
  do {
    const data: {
      products: { nodes: { variants: { nodes: { id: string }[] } }[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
    } = await gql(FILTERED_VARIANTS, { query, after });
    for (const p of data.products.nodes) ids.push(...p.variants.nodes.map((v) => v.id));
    if (ids.length >= MAX_FILTERED_VARIANTS) return { ids: ids.slice(0, MAX_FILTERED_VARIANTS), truncated: true };
    after = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
  } while (after);
  return { ids, truncated: false };
}
