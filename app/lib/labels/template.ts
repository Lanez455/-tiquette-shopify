// Modèle d'étiquette : les éléments que l'éditeur visuel (F5) place sur l'étiquette.
// Positions et tailles en mm depuis le coin haut-gauche de l'étiquette.

export type FieldKey =
  | "title"
  // Titre suivi de la variante (« Bague Lune · 52 »), ou le titre seul
  | "titleWithVariant"
  | "variantTitle"
  | "sku"
  | "price"
  | "compareAtPrice"
  | "vendor"
  | "productType"
  | "barcodeDigits"
  // « metafield:product.namespace.key » ou « metafield:variant.namespace.key »
  | `metafield:${string}`;

interface Box {
  xMm: number;
  yMm: number;
  wMm: number;
  hMm: number;
}

export interface TextStyle {
  maxFontSize: number;
  minFontSize: number;
  bold?: boolean;
  align?: "left" | "center" | "right";
  maxLines?: number;
}

export type LabelElement =
  | ({ kind: "field"; field: FieldKey } & Box & TextStyle)
  | ({ kind: "text"; text: string } & Box & TextStyle)
  | ({ kind: "barcode"; showDigits: boolean } & Box)
  // QR code vers la fiche produit de la boutique en ligne (F22)
  | ({ kind: "qr" } & Box);

export interface LabelTemplateLayout {
  elements: LabelElement[];
}

// Données d'une variante à imprimer, déjà lues depuis Shopify
export interface LabelItem {
  title: string;
  variantTitle?: string | null;
  sku?: string | null;
  price?: string | null;
  compareAtPrice?: string | null;
  vendor?: string | null;
  productType?: string | null;
  barcode?: string | null;
  metafields?: Record<string, string>;
  // Adresse de la fiche produit, pour le QR code (F22)
  productUrl?: string | null;
}
