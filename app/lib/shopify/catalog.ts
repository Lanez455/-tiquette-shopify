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

// Ce que les modèles demandent en plus des champs de base. Les lister tous
// (metafields(first: 25), collections(first: 25)) coûtait 83 points par
// variante : Shopify refuse toute requête au-delà de 1 000 points.
export interface LabelNeeds {
  // « product.namespace.key » ou « variant.namespace.key »
  metafields?: string[];
  // Collections des règles automatiques : on demande seulement l'appartenance
  collectionIds?: string[];
}

const METAFIELD_KEY = /^(product|variant)\.([\w-]+)\.([\w-]+)$/;

// Coût Shopify : 1 point par objet. Une variante = variante + produit + un point par métachamp.
const COST_BUDGET = 900;
const MAX_NODES_PER_CALL = 250;

function labelsQuery(metafields: string[], collectionIds: string[]): string {
  const alias = (key: string, i: number) => {
    const [, , namespace, name] = METAFIELD_KEY.exec(key)!;
    return `m${i}: metafield(namespace: ${JSON.stringify(namespace)}, key: ${JSON.stringify(name)}) { value }`;
  };
  const on = (owner: string) => metafields.map((k, i) => (k.startsWith(`${owner}.`) ? alias(k, i) : "")).filter(Boolean).join("\n");
  const inCollections = collectionIds.map((id, i) => `c${i}: inCollection(id: ${JSON.stringify(id)})`).join("\n");
  return `#graphql
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
        ${on("variant")}
        product {
          id
          title
          vendor
          productType
          onlineStoreUrl
          ${on("product")}
          ${inCollections}
        }
      }
    }
  }`;
}

type Aliased = Record<string, unknown>;

interface VariantNode extends Aliased {
  id: string;
  title: string;
  sku: string | null;
  barcode: string | null;
  price: string;
  compareAtPrice: string | null;
  inventoryQuantity: number | null;
  product: Aliased & {
    id: string;
    title: string;
    vendor: string;
    productType: string;
    // Nul si le produit n'est pas publié sur la boutique en ligne
    onlineStoreUrl: string | null;
  };
}

export interface LabelVariant extends LabelItem {
  variantId: string;
  productId: string;
  collectionIds: string[];
  inventoryQuantity: number | null;
}

// Les métachamps des modèles, pour ne demander que ceux-là
export function metafieldsUsed(layouts: { elements: { kind: string; field?: string }[] }[]): string[] {
  const keys = new Set<string>();
  for (const layout of layouts) {
    for (const e of layout.elements) {
      if (e.kind === "field" && e.field?.startsWith("metafield:")) keys.add(e.field.slice("metafield:".length));
    }
  }
  return [...keys].filter((k) => METAFIELD_KEY.test(k)).sort();
}

export async function fetchVariantsForLabels(gql: Gql, ids: string[], needs: LabelNeeds = {}): Promise<LabelVariant[]> {
  const unique = [...new Set(ids)];
  const metafields = [...new Set(needs.metafields ?? [])].filter((k) => METAFIELD_KEY.test(k));
  const collectionIds = [...new Set(needs.collectionIds ?? [])];
  const query = labelsQuery(metafields, collectionIds);
  const perCall = Math.max(1, Math.min(MAX_NODES_PER_CALL, Math.floor(COST_BUDGET / (2 + metafields.length))));
  const byId = new Map<string, LabelVariant>();
  for (let i = 0; i < unique.length; i += perCall) {
    const data = await gql<{ nodes: (VariantNode | null)[] }>(query, { ids: unique.slice(i, i + perCall) });
    for (const v of data.nodes) {
      if (!v || !v.product) continue;
      const values: Record<string, string> = {};
      metafields.forEach((key, n) => {
        const owner = key.startsWith("product.") ? v.product : v;
        const value = (owner[`m${n}`] as { value: string } | null | undefined)?.value;
        if (value != null) values[key] = value;
      });
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
        collectionIds: collectionIds.filter((_, n) => v.product[`c${n}`] === true),
        inventoryQuantity: v.inventoryQuantity,
        metafields: values,
        productUrl: v.product.onlineStoreUrl,
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

const NODE_TYPES = `#graphql
  query NodeTypes($ids: [ID!]!) {
    nodes(ids: $ids) {
      __typename
      ... on Product { id }
      ... on ProductVariant { id }
    }
  }`;

// Les variantes de plusieurs produits, toutes pages comprises : un produit
// peut dépasser 250 variantes, qu'un simple variants(first: 250) tronquerait
const VARIANTS_OF_PRODUCTS = `#graphql
  query VariantsOfProducts($query: String!, $after: String) {
    productVariants(first: 250, after: $after, query: $query, sortKey: POSITION) {
      nodes { id product { id } }
      pageInfo { hasNextPage endCursor }
    }
  }`;

const IDS_PER_CALL = 250;
const PRODUCTS_PER_SEARCH = 50;

async function variantsOfProducts(gql: Gql, productIds: string[]): Promise<Map<string, string[]>> {
  const byProduct = new Map<string, string[]>(productIds.map((id) => [id, []]));
  for (let i = 0; i < productIds.length; i += PRODUCTS_PER_SEARCH) {
    const query = `product_ids:${productIds.slice(i, i + PRODUCTS_PER_SEARCH).map((id) => id.split("/").pop()).join(",")}`;
    let after: string | null = null;
    do {
      const data: {
        productVariants: { nodes: { id: string; product: { id: string } }[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
      } = await gql(VARIANTS_OF_PRODUCTS, { query, after });
      for (const v of data.productVariants.nodes) byProduct.get(v.product.id)?.push(v.id);
      after = data.productVariants.pageInfo.hasNextPage ? data.productVariants.pageInfo.endCursor : null;
    } while (after);
  }
  return byProduct;
}

// Les extensions d'impression envoient des produits ou des variantes : tout devient variantes
export async function expandToVariantIds(gql: Gql, ids: string[]): Promise<string[]> {
  const typed: { id: string; type: string }[] = [];
  for (let i = 0; i < ids.length; i += IDS_PER_CALL) {
    const data = await gql<{ nodes: ({ __typename: string; id?: string } | null)[] }>(NODE_TYPES, {
      ids: ids.slice(i, i + IDS_PER_CALL),
    });
    for (const node of data.nodes) if (node?.id) typed.push({ id: node.id, type: node.__typename });
  }
  const productIds = [...new Set(typed.filter((n) => n.type === "Product").map((n) => n.id))];
  const variantsByProduct = productIds.length ? await variantsOfProducts(gql, productIds) : new Map<string, string[]>();
  const out = typed.flatMap((n) => (n.type === "Product" ? variantsByProduct.get(n.id) ?? [] : n.type === "ProductVariant" ? [n.id] : []));
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

const FILTERED_PRODUCTS = `#graphql
  query FilteredProducts($query: String!, $after: String) {
    products(first: 250, after: $after, query: $query) {
      nodes { id }
      pageInfo { hasNextPage endCursor }
    }
  }`;

export const MAX_FILTERED_VARIANTS = 2000;

// « Tout sélectionner » sur un filtre (F13), plafonné pour garder l'écran utilisable.
// Deux temps : les produits du filtre, puis leurs variantes (requêtes sous la limite de coût).
export async function fetchVariantIdsByFilter(gql: Gql, filter: ProductFilter): Promise<{ ids: string[]; truncated: boolean }> {
  const query = productSearchQuery(filter);
  const ids: string[] = [];
  let after: string | null = null;
  do {
    const data: { products: { nodes: { id: string }[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } } =
      await gql(FILTERED_PRODUCTS, { query, after });
    const byProduct = await variantsOfProducts(gql, data.products.nodes.map((p) => p.id));
    for (const variants of byProduct.values()) ids.push(...variants);
    if (ids.length >= MAX_FILTERED_VARIANTS) return { ids: ids.slice(0, MAX_FILTERED_VARIANTS), truncated: true };
    after = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
  } while (after);
  return { ids, truncated: false };
}
