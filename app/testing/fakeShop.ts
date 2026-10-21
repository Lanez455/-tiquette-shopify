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
        nodes: page.map((v) => ({ id: v.id, barcode: v.barcode, product: { id: v.productId } })),
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
