import { detectDelimiter, splitLine, splitRecords } from "../import/csv";
import { isValidGtin, normalizeBarcode } from "./checksum";
import { ConfirmationRequiredError, replaceConfirmationPhrase, type BarcodeAssignment } from "./plan";

// Import des GTIN achetés auprès de GS1 (F19). L'app n'en invente jamais :
// elle vérifie la clé de contrôle et attribue seulement les codes fournis.

export type GtinCheck = { ok: true; gtin: string } | { ok: false; reason: string };

export function checkGtin(raw: string): GtinCheck {
  const gtin = raw.replace(/[\s-]/g, "");
  if (!/^\d+$/.test(gtin)) return { ok: false, reason: "Un GTIN ne contient que des chiffres" };
  if (![8, 12, 13, 14].includes(gtin.length)) return { ok: false, reason: `${gtin.length} chiffres : un GTIN en a 8, 12, 13 ou 14` };
  if (!isValidGtin(gtin)) return { ok: false, reason: "Clé de contrôle fausse (dernier chiffre) : faute de frappe ?" };
  // Préfixes réservés à l'usage interne d'un magasin : ce ne sont pas des GTIN GS1
  if ((gtin.length === 13 && gtin.startsWith("2")) || (gtin.length === 12 && /^[24]/.test(gtin)) || (gtin.length === 8 && /^[02]/.test(gtin))) {
    return { ok: false, reason: "Code interne de magasin, pas un GTIN acheté chez GS1" };
  }
  return { ok: true, gtin };
}

export interface Gs1Row {
  line: number;
  gtin: string;
  // SKU ou ID de variante ; vide = GTIN libre, attribué à une variante sans code
  key: string;
}

const GTIN_HEADERS = new Set(["gtin", "ean", "upc", "code-barres", "code barres", "barcode", "gs1"]);
const KEY_HEADERS = new Set(["sku", "référence", "reference", "variant id", "id variante", "variant sku"]);

export function parseGs1Input(input: string): { rows: Gs1Row[]; errors: { line: number; message: string }[] } {
  const records = splitRecords(input.replace(/^﻿/, ""));
  const first = records.findIndex((r) => r.trim() !== "");
  if (first < 0) return { rows: [], errors: [{ line: 1, message: "Rien à importer" }] };
  const delimiter = detectDelimiter(records[first]!);
  const header = splitLine(records[first]!, delimiter).map((h) => h.toLowerCase().trim());
  const hasHeader = header.some((h) => GTIN_HEADERS.has(h) || KEY_HEADERS.has(h));
  let gtinCol = 0;
  let keyCol = -1;
  if (hasHeader) {
    gtinCol = header.findIndex((h) => GTIN_HEADERS.has(h));
    keyCol = header.findIndex((h) => KEY_HEADERS.has(h));
    if (gtinCol < 0) return { rows: [], errors: [{ line: first + 1, message: "Colonne GTIN introuvable" }] };
  } else if (splitLine(records[first]!, delimiter).length > 1) {
    // Sans en-tête, sur deux colonnes : SKU puis GTIN
    keyCol = 0;
    gtinCol = 1;
  }

  const rows: Gs1Row[] = [];
  const errors: { line: number; message: string }[] = [];
  const seen = new Map<string, number>();
  for (let i = hasHeader ? first + 1 : first; i < records.length; i++) {
    if (!records[i]!.trim() || /^[;,\t\s]*$/.test(records[i]!)) continue;
    const fields = splitLine(records[i]!, delimiter);
    const check = checkGtin(fields[gtinCol] ?? "");
    if (!check.ok) { errors.push({ line: i + 1, message: `${fields[gtinCol] ?? ""} : ${check.reason}` }); continue; }
    const key = normalizeBarcode(check.gtin);
    if (seen.has(key)) { errors.push({ line: i + 1, message: `${check.gtin} : déjà présent ligne ${seen.get(key)}` }); continue; }
    seen.set(key, i + 1);
    rows.push({ line: i + 1, gtin: check.gtin, key: keyCol >= 0 ? (fields[keyCol] ?? "").trim() : "" });
  }
  if (rows.length > 5000) return { rows: [], errors: [{ line: 1, message: "5 000 GTIN au maximum par import" }] };
  return { rows, errors };
}

export interface CatalogEntry {
  variantId: string;
  barcode: string | null;
  sku?: string | null;
}

export interface Gs1Plan {
  assignments: BarcodeAssignment[];
  problems: { line: number; message: string }[];
  // GTIN libres restés sans variante : ils restent au marchand
  unused: string[];
  replacing: number;
}

const hasCode = (v: CatalogEntry) => Boolean(v.barcode?.trim());

// Calcule les attributions sans rien écrire. Un code existant n'est remplacé
// qu'avec la phrase de confirmation (F11), comme pour les codes internes.
export function planGs1Import(rows: Gs1Row[], catalog: CatalogEntry[], confirmation?: string): Gs1Plan {
  const problems: Gs1Plan["problems"] = [];
  const byId = new Map(catalog.map((v) => [v.variantId, v]));
  const bySku = new Map<string, CatalogEntry[]>();
  for (const v of catalog) {
    if (!v.sku?.trim()) continue;
    const k = v.sku.trim().toLowerCase();
    bySku.set(k, [...(bySku.get(k) ?? []), v]);
  }
  const usedBy = new Map(catalog.filter(hasCode).map((v) => [normalizeBarcode(v.barcode!), v.variantId]));

  const assignments: BarcodeAssignment[] = [];
  const targeted = new Set<string>();
  const free: Gs1Row[] = [];

  for (const row of rows) {
    const owner = usedBy.get(normalizeBarcode(row.gtin));
    if (!row.key) {
      if (owner) problems.push({ line: row.line, message: `${row.gtin} est déjà sur une variante` });
      else free.push(row);
      continue;
    }
    const gid = /^\d+$/.test(row.key) ? `gid://shopify/ProductVariant/${row.key}` : row.key;
    const matches = byId.has(gid) ? [byId.get(gid)!] : (bySku.get(row.key.toLowerCase()) ?? []);
    if (!matches.length) { problems.push({ line: row.line, message: `Aucune variante pour « ${row.key} »` }); continue; }
    if (matches.length > 1) { problems.push({ line: row.line, message: `${matches.length} variantes ont le SKU « ${row.key} »` }); continue; }
    const variant = matches[0]!;
    if (owner && owner !== variant.variantId) { problems.push({ line: row.line, message: `${row.gtin} est déjà sur une autre variante` }); continue; }
    if (owner === variant.variantId) continue; // déjà en place
    if (targeted.has(variant.variantId)) { problems.push({ line: row.line, message: `« ${row.key} » reçoit deux GTIN dans le fichier` }); continue; }
    targeted.add(variant.variantId);
    assignments.push({ variantId: variant.variantId, oldValue: hasCode(variant) ? variant.barcode : null, newValue: row.gtin });
  }

  // GTIN libres : aux variantes sans code, dans l'ordre du catalogue
  const waiting = catalog.filter((v) => !hasCode(v) && !targeted.has(v.variantId));
  const unused: string[] = [];
  free.forEach((row, i) => {
    const variant = waiting[i];
    if (variant) assignments.push({ variantId: variant.variantId, oldValue: null, newValue: row.gtin });
    else unused.push(row.gtin);
  });

  const replacing = assignments.filter((a) => a.oldValue).length;
  if (replacing > 0 && confirmation !== replaceConfirmationPhrase(replacing)) {
    throw new ConfirmationRequiredError(replaceConfirmationPhrase(replacing));
  }
  return { assignments, problems, unused, replacing };
}
