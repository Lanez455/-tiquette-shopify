import { describe, expect, it } from "vitest";
import { defaultLayout } from "../labels/defaultLayouts";
import { getFormat } from "../labels/formats";
import type { ResolvedTemplate } from "../labels/templates.server";
import { FakeShop } from "~/testing/fakeShop";
import { printPdf, scanPrinted } from "~/testing/printSimulator";
import { PrintJobError } from "./job";
import { parseLinesParam, planLinkedJob, renderLinkedJob } from "./links.server";
import { createPrintLink, verifyPrintLink } from "./signedLink";

const template = (id: string, formatId: string): ResolvedTemplate => {
  const format = getFormat(formatId)!;
  return { id, name: id, format, layout: defaultLayout(format), collectionIds: [], builtin: false };
};
const templates = [template("std", "zebra-2x1"), template("dymo", "dymo-30336")];
const settings = { offsetXmm: 0, offsetYmm: 0, rotate90: false, printerDpi: 203, price: { currency: "EUR", locale: "fr-FR" } };

function shop() {
  const s = new FakeShop();
  s.addProduct({ id: "p1", title: "Bague" }, [{ id: "v1", barcode: "2000000000015", inventoryQuantity: 4 }]);
  s.addProduct({ id: "p2", title: "T-shirt" }, [
    { id: "v2", barcode: "LB00000002", inventoryQuantity: -3 },
    { id: "v3", barcode: "2000000000022", inventoryQuantity: 2 },
  ]);
  return s;
}

describe("bouton Imprimer de l'admin et de la caisse (F15)", () => {
  it("développe les produits sélectionnés en variantes", async () => {
    const plan = await planLinkedJob(shop().gql, { ids: ["p1", "p2"], quantity: 2 }, templates, "std");
    expect(plan).toEqual({
      templateId: "std",
      labelCount: 6,
      lines: [{ variantId: "v1", quantity: 2 }, { variantId: "v2", quantity: 2 }, { variantId: "v3", quantity: 2 }],
    });
  });

  it("quantité = stock : un stock négatif donne 0 étiquette", async () => {
    const plan = await planLinkedJob(shop().gql, { ids: ["p1", "p2"], quantity: "stock" }, templates, "std");
    expect(plan.lines).toEqual([{ variantId: "v1", quantity: 4 }, { variantId: "v3", quantity: 2 }]);
  });

  it("panier de la caisse : garde les quantités des lignes", async () => {
    const plan = await planLinkedJob(shop().gql, { lines: [{ variantId: "v3", quantity: 3 }], templateId: "dymo" }, templates, "std");
    expect(plan).toMatchObject({ templateId: "dymo", labelCount: 3 });
  });

  it("le choix automatique devient le modèle par défaut (un seul format par PDF)", async () => {
    const plan = await planLinkedJob(shop().gql, { ids: ["p1"], templateId: "auto" }, templates, "dymo");
    expect(plan.templateId).toBe("dymo");
  });

  it("refuse les demandes invalides", async () => {
    const gql = shop().gql;
    await expect(planLinkedJob(gql, { ids: [] }, templates, "std")).rejects.toThrow(PrintJobError);
    await expect(planLinkedJob(gql, { ids: ["p1"], quantity: 0 }, templates, "std")).rejects.toThrow(/quantités sont à 0/);
    await expect(planLinkedJob(gql, { ids: ["p1"], quantity: 1.5 }, templates, "std")).rejects.toThrow(/Quantité invalide/);
    await expect(planLinkedJob(gql, { ids: ["p1"], templateId: "inconnu" }, templates, "std")).rejects.toThrow(/Modèle introuvable/);
    await expect(planLinkedJob(gql, { lines: [{ variantId: "v1", quantity: -1 }] }, templates, "std")).rejects.toThrow(/Quantité invalide/);
    await expect(planLinkedJob(gql, { ids: Array(251).fill("p1") }, templates, "std")).rejects.toThrow(/250/);
  });

  it("de bout en bout : demande, lien signé, ouverture du lien, PDF imprimé et scanné", async () => {
    const s = shop();
    const plan = await planLinkedJob(s.gql, { ids: ["p2"], quantity: 1 }, templates, "std");
    const job = { id: "job1", templateId: plan.templateId, itemsJson: JSON.stringify(plan.lines) };
    const link = createPrintLink({ shop: "demo.myshopify.com", jobId: job.id }, "secret");
    const payload = verifyPrintLink(new URLSearchParams(link), "secret");
    expect(payload.jobId).toBe("job1");
    const { pdf } = await renderLinkedJob({ gql: s.gql, job, templates, settings });
    const pages = await printPdf(pdf, 203);
    expect(pages).toHaveLength(2);
    expect(pages.map(scanPrinted)).toEqual(["LB00000002", "2000000000022"]);
  });

  it("produits supprimés entre-temps : message clair", async () => {
    const job = { templateId: "std", itemsJson: JSON.stringify([{ variantId: "disparu", quantity: 1 }]) };
    await expect(renderLinkedJob({ gql: shop().gql, job, templates, settings })).rejects.toThrow(PrintJobError);
  });

  it("lit les lignes envoyées par la caisse", () => {
    expect(parseLinesParam("123:2, 456:1")).toEqual([
      { variantId: "gid://shopify/ProductVariant/123", quantity: 2 },
      { variantId: "gid://shopify/ProductVariant/456", quantity: 1 },
    ]);
    expect(() => parseLinesParam(null)).toThrow(PrintJobError);
    expect(() => parseLinesParam("abc:1")).toThrow(/illisible/);
    expect(() => parseLinesParam("1:-2")).toThrow(/illisible/);
    expect(() => parseLinesParam("1:2;DROP")).toThrow(/illisible/);
  });
});
