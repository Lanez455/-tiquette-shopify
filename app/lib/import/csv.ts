import { MAX_PER_JOB, MAX_PER_LINE } from "../print/job";

// Import d'une liste d'étiquettes depuis un fichier CSV (F14).
// Accepte les exports Excel français (« ; ») comme anglais (« , ») ou les tabulations.

export type KeyKind = "barcode" | "sku" | "variant" | "any";

export interface CsvRow {
  line: number;
  key: string;
  kind: KeyKind;
  quantity: number;
}

export interface CsvResult {
  rows: CsvRow[];
  errors: { line: number; message: string }[];
}

const MAX_ROWS = MAX_PER_JOB;

const HEADERS: Record<string, KeyKind | "quantity"> = {
  barcode: "barcode", "code-barres": "barcode", "code barres": "barcode", "code-barre": "barcode", "code barre": "barcode",
  ean: "barcode", gtin: "barcode", upc: "barcode", "variant barcode": "barcode",
  sku: "sku", "variant sku": "sku", référence: "sku", reference: "sku", ref: "sku",
  "variant id": "variant", "id variante": "variant", variant_id: "variant",
  code: "any",
  quantity: "quantity", quantité: "quantity", quantite: "quantity", qty: "quantity", qté: "quantity", qte: "quantity",
  étiquettes: "quantity", etiquettes: "quantity", labels: "quantity", "nombre": "quantity",
};

// Découpe une ligne CSV en champs, guillemets doublés compris
export function splitLine(text: string, delimiter: string): string[] {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field.trim() === "") { field = ""; quoted = true; }
    else if (c === delimiter) { fields.push(field.trim()); field = ""; }
    else field += c;
  }
  fields.push(field.trim());
  return fields;
}

// Découpe en lignes en respectant les retours à la ligne entre guillemets
export function splitRecords(text: string): string[] {
  const records: string[] = [];
  let current = "";
  let quoted = false;
  for (const c of text) {
    if (c === '"') quoted = !quoted;
    if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\n") { records.push(current); current = ""; }
      continue;
    }
    current += c;
  }
  records.push(current);
  return records;
}

export function detectDelimiter(first: string): string {
  const counts = [";", ",", "\t"].map((d) => [d, first.split(d).length] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0]![1] > 1 ? counts[0]![0] : ",";
}

const normalizeHeader = (h: string) => h.toLowerCase().replace(/\s+/g, " ").trim();

export function parseLabelCsv(input: string): CsvResult {
  const text = input.replace(/^﻿/, "");
  const records = splitRecords(text);
  const firstIndex = records.findIndex((r) => r.trim() !== "");
  if (firstIndex < 0) return { rows: [], errors: [{ line: 1, message: "Fichier vide" }] };
  const delimiter = detectDelimiter(records[firstIndex]!);

  // Ligne d'en-tête reconnue ? Sinon : 1re colonne = code, 2e = quantité
  const header = splitLine(records[firstIndex]!, delimiter).map((h) => HEADERS[normalizeHeader(h)]);
  const hasHeader = header.some((h) => h !== undefined);
  let keyColumns: { index: number; kind: KeyKind }[];
  let quantityColumn: number;
  if (hasHeader) {
    keyColumns = header.flatMap((h, index) => (h && h !== "quantity" ? [{ index, kind: h }] : []));
    quantityColumn = header.indexOf("quantity");
    if (!keyColumns.length) {
      return { rows: [], errors: [{ line: firstIndex + 1, message: "Colonne code-barres, SKU ou ID de variante introuvable" }] };
    }
  } else {
    keyColumns = [{ index: 0, kind: "any" }];
    quantityColumn = 1;
  }

  const rows: CsvRow[] = [];
  const errors: CsvResult["errors"] = [];
  for (let i = hasHeader ? firstIndex + 1 : firstIndex; i < records.length; i++) {
    const record = records[i]!;
    if (record.trim() === "" || /^[;,\t\s]*$/.test(record)) continue;
    const line = i + 1;
    const fields = splitLine(record, delimiter);
    const found = keyColumns.map((c) => ({ kind: c.kind, key: fields[c.index] ?? "" })).find((k) => k.key !== "");
    if (!found) { errors.push({ line, message: "Code manquant" }); continue; }
    if (/^\d+([.,]\d+)?e\+?\d+$/i.test(found.key)) {
      errors.push({ line, message: `Code « ${found.key} » abîmé par Excel (notation scientifique) : mettez la colonne au format Texte` });
      continue;
    }
    const rawQuantity = quantityColumn >= 0 ? (fields[quantityColumn] ?? "") : "";
    const quantity = rawQuantity === "" ? 1 : Number(rawQuantity.replace(/\s/g, "").replace(/,0+$/, ""));
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_PER_LINE) {
      errors.push({ line, message: `Quantité invalide « ${rawQuantity} » (0 à ${MAX_PER_LINE})` });
      continue;
    }
    rows.push({ line, key: found.key, kind: found.kind, quantity });
    if (rows.length > MAX_ROWS) return { rows: [], errors: [{ line, message: `${MAX_ROWS} lignes au maximum` }] };
  }
  return { rows, errors };
}
