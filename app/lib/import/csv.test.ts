import { describe, expect, it } from "vitest";
import { FakeShop } from "~/testing/fakeShop";
import { parseLabelCsv } from "./csv";
import { matchCsvRows } from "./match";

describe("lecture du CSV (F14)", () => {
  it("export Excel français : point-virgule, BOM, CRLF, en-têtes accentués", () => {
    const csv = "﻿Référence;Code-barres;Quantité\r\nTS-M;;3\r\n;2000000000015;2\r\n\r\n";
    expect(parseLabelCsv(csv)).toEqual({
      rows: [
        { line: 2, key: "TS-M", kind: "sku", quantity: 3 },
        { line: 3, key: "2000000000015", kind: "barcode", quantity: 2 },
      ],
      errors: [],
    });
  });

  it("export anglais, guillemets, virgule dans un champ, quantité vide = 1", () => {
    const csv = 'Variant SKU,Title,Qty\n"A,1","T-shirt ""rouge""",\nB2,Pull,4';
    expect(parseLabelCsv(csv).rows).toEqual([
      { line: 2, key: "A,1", kind: "sku", quantity: 1 },
      { line: 3, key: "B2", kind: "sku", quantity: 4 },
    ]);
  });

  it("sans en-tête : code puis quantité, tabulations", () => {
    expect(parseLabelCsv("2000000000015\t5\nLB00000002\t1").rows).toEqual([
      { line: 1, key: "2000000000015", kind: "any", quantity: 5 },
      { line: 2, key: "LB00000002", kind: "any", quantity: 1 },
    ]);
  });

  it("signale les lignes fautives sans bloquer les autres", () => {
    const csv = "sku;quantité\nA;deux\nB;-1\nC;1001\n;4\nD;2,00\nE;3";
    const { rows, errors } = parseLabelCsv(csv);
    expect(rows.map((r) => [r.key, r.quantity])).toEqual([["D", 2], ["E", 3]]);
    expect(errors.map((e) => e.line)).toEqual([2, 3, 4, 5]);
  });

  it("repère les codes abîmés par Excel (notation scientifique)", () => {
    const { rows, errors } = parseLabelCsv("barcode;qty\n2,00000E+12;1");
    expect(rows).toEqual([]);
    expect(errors[0]!.message).toMatch(/Excel/);
  });

  it("refuse un fichier vide ou sans colonne de code", () => {
    expect(parseLabelCsv("  \n").errors[0]!.message).toBe("Fichier vide");
    expect(parseLabelCsv("titre;quantité\nPull;2").errors[0]!.message).toMatch(/introuvable/);
  });
});

function shop() {
  const s = new FakeShop();
  s.addProduct({ id: "p1", title: "T-shirt" }, [
    { id: "v1", sku: "TS-M", barcode: "2000000000015" },
    { id: "v2", sku: "TS-L", barcode: "012345678905" },
    { id: "v3", sku: "DOUBLON", barcode: "2000000000022" },
    { id: "v4", sku: "doublon", barcode: null },
  ]);
  return s;
}

describe("correspondance avec la boutique (F14)", () => {
  it("retrouve par SKU, code-barres, UPC avec ou sans 0, ID de variante", async () => {
    const rows = parseLabelCsv("code;qty\nts-m;2\n0012345678905;1\n2000000000022;4").rows;
    const result = await matchCsvRows(shop().gql, rows);
    expect(result.problems).toEqual([]);
    expect(result.lines).toEqual([
      { variantId: "v1", quantity: 2 },
      { variantId: "v2", quantity: 1 },
      { variantId: "v3", quantity: 4 },
    ]);
    const byId = await matchCsvRows(shop().gql, parseLabelCsv("variant id;qty\n123;2\nabc;1").rows);
    expect(byId.lines).toEqual([{ variantId: "gid://shopify/ProductVariant/123", quantity: 2 }]);
    expect(byId.problems[0]!.message).toMatch(/invalide/);
  });

  it("additionne les doublons du fichier, refuse les codes ambigus ou inconnus", async () => {
    const rows = parseLabelCsv("sku;qty\nTS-M;2\nTS-M;3\nDOUBLON;1\nINCONNU;1").rows;
    const result = await matchCsvRows(shop().gql, rows);
    expect(result.lines).toEqual([{ variantId: "v1", quantity: 5 }]);
    expect(result.problems.map((p) => [p.line, p.message])).toEqual([
      [4, "2 articles portent ce code : corrigez les doublons"],
      [5, "Aucun article trouvé"],
    ]);
  });

  it("plafonne un total trop grand et le dit", async () => {
    const result = await matchCsvRows(shop().gql, parseLabelCsv("sku;qty\nTS-M;800\nTS-M;800").rows);
    expect(result.lines).toEqual([{ variantId: "v1", quantity: 1000 }]);
    expect(result.problems[0]!.message).toMatch(/1600/);
  });

  it("un bon de 200 lignes : 200 lignes aux bonnes quantités, en peu d'appels", async () => {
    const s = new FakeShop();
    s.addProduct({ id: "p" }, Array.from({ length: 200 }, (_, i) => ({ id: `v${i}`, sku: `SKU-${i}` })));
    const csv = ["sku;qty", ...Array.from({ length: 200 }, (_, i) => `SKU-${i};${(i % 7) + 1}`)].join("\n");
    const result = await matchCsvRows(s.gql, parseLabelCsv(csv).rows);
    expect(result.lines).toHaveLength(200);
    expect(result.lines[13]).toEqual({ variantId: "v13", quantity: 7 });
    expect(s.calls.filter((c) => c.operation === "VariantLookup").length).toBe(5);
  });

  it("échappe les guillemets dans la recherche", async () => {
    const s = new FakeShop();
    s.addProduct({ id: "p" }, [{ id: "v", sku: 'A"B' }]);
    const result = await matchCsvRows(s.gql, [{ line: 2, key: 'A"B', kind: "sku", quantity: 1 }]);
    expect(result.lines).toEqual([{ variantId: "v", quantity: 1 }]);
  });
});
