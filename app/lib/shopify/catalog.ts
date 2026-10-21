import type { LabelItem } from "../labels/template";
import { ShopifyUserError, type Gql } from "./graphql";

export interface CatalogVariant {
  variantId: string;
  productId: string;
  barcode: string | null;
}

const VARIANT_BARCODES = `#graphql
  query VariantBarcodes($after: String) {
    productVariants(first: 250, after: $after) {
      nodes { id barcode product { id } }
      pageInfo { hasNextPage endCursor }
    }
  }`;

interface VariantBarcodesData {
  productVariants: {
    nodes: { id: string; barcode: string | null; product: { id: string } }[];
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
      result.push({ variantId: node.id, productId: node.product.id, barcode: node.barcode });
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
