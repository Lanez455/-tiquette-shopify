import type { Gql } from "../shopify/graphql";
import { MAX_PER_LINE, type PrintLine } from "../print/job";
import type { CsvRow } from "./csv";

// Retrouve les variantes des lignes CSV par code-barres, SKU ou ID (F14)

const LOOKUP = `#graphql
  query VariantLookup($query: String!) {
    productVariants(first: 250, query: $query) {
      nodes { id sku barcode }
    }
  }`;

const KEYS_PER_CALL = 40;
const quote = (value: string) => `"${value.replace(/["\\]/g, "\\$&")}"`;
const same = (a: string | null, b: string) => !!a && a.trim().toLowerCase() === b.trim().toLowerCase();
// Un UPC-A à 12 chiffres et son EAN-13 avec un 0 devant désignent le même article
const sameBarcode = (a: string | null, b: string) =>
  !!a && (same(a, b) || (/^\d+$/.test(a) && /^\d+$/.test(b) && a.replace(/^0+/, "") === b.replace(/^0+/, "")));

export interface MatchResult {
  lines: PrintLine[];
  problems: { line: number; key: string; message: string }[];
}

function searchTerms(row: CsvRow): string[] {
  const terms: string[] = [];
  if (row.kind === "barcode" || row.kind === "any") {
    terms.push(`barcode:${quote(row.key)}`);
    if (/^\d{12}$/.test(row.key)) terms.push(`barcode:${quote("0" + row.key)}`);
    if (/^0\d{12}$/.test(row.key)) terms.push(`barcode:${quote(row.key.slice(1))}`);
  }
  if (row.kind === "sku" || row.kind === "any") terms.push(`sku:${quote(row.key)}`);
  return terms;
}

const variantGid = (key: string) =>
  /^gid:\/\/shopify\/ProductVariant\/\d+$/.test(key) ? key : /^\d+$/.test(key) ? `gid://shopify/ProductVariant/${key}` : null;

export async function matchCsvRows(gql: Gql, rows: CsvRow[]): Promise<MatchResult> {
  const problems: MatchResult["problems"] = [];
  const found: { row: CsvRow; variantId: string }[] = [];

  const byId = rows.filter((r) => r.kind === "variant");
  for (const row of byId) {
    const gid = variantGid(row.key);
    if (gid) found.push({ row, variantId: gid });
    else problems.push({ line: row.line, key: row.key, message: "ID de variante invalide" });
  }

  const searched = rows.filter((r) => r.kind !== "variant");
  const uniqueKeys = [...new Map(searched.map((r) => [`${r.kind}|${r.key}`, r])).values()];
  const candidates: { id: string; sku: string | null; barcode: string | null }[] = [];
  for (let i = 0; i < uniqueKeys.length; i += KEYS_PER_CALL) {
    const query = uniqueKeys.slice(i, i + KEYS_PER_CALL).flatMap(searchTerms).join(" OR ");
    const data = await gql<{ productVariants: { nodes: typeof candidates } }>(LOOKUP, { query });
    candidates.push(...data.productVariants.nodes);
  }

  for (const row of searched) {
    const byBarcode = row.kind !== "sku" ? candidates.filter((c) => sameBarcode(c.barcode, row.key)) : [];
    const bySku = row.kind !== "barcode" ? candidates.filter((c) => same(c.sku, row.key)) : [];
    // Le code-barres prime sur le SKU quand la colonne est « code »
    const matches = [...new Map((byBarcode.length ? byBarcode : bySku).map((c) => [c.id, c])).values()];
    if (matches.length === 1) found.push({ row, variantId: matches[0]!.id });
    else if (!matches.length) problems.push({ line: row.line, key: row.key, message: "Aucun article trouvé" });
    else problems.push({ line: row.line, key: row.key, message: `${matches.length} articles portent ce code : corrigez les doublons` });
  }

  // Une variante présente plusieurs fois : les quantités s'additionnent
  const totals = new Map<string, number>();
  for (const f of found.sort((a, b) => a.row.line - b.row.line)) {
    totals.set(f.variantId, (totals.get(f.variantId) ?? 0) + f.row.quantity);
  }
  const lines: PrintLine[] = [];
  for (const [variantId, quantity] of totals) {
    if (quantity > MAX_PER_LINE) {
      const first = found.find((f) => f.variantId === variantId)!.row;
      problems.push({ line: first.line, key: first.key, message: `${quantity} étiquettes demandées au total : ramené à ${MAX_PER_LINE}` });
    }
    lines.push({ variantId, quantity: Math.min(quantity, MAX_PER_LINE) });
  }
  return { lines, problems: problems.sort((a, b) => a.line - b.line) };
}
