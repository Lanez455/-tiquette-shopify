import { useEffect, useMemo, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useSearchParams } from "react-router";
import { authenticate } from "../shopify.server";
import { listTemplates } from "../lib/labels/templates.server";
import { AUTO_TEMPLATE, initialQuantity, MAX_PER_LINE, type DefaultQuantity } from "../lib/print/job";
import { pdfUrl, printPdfUrl, requestPrint } from "../lib/print/client";
import { getSettings } from "../lib/settings.server";
import { expandToVariantIds, fetchVariantIdsByFilter, fetchVariantsForLabels } from "../lib/shopify/catalog";
import { gqlFromAdmin, type Gql } from "../lib/shopify/graphql";

interface Line {
  variantId: string;
  title: string;
  variantTitle: string;
  sku: string;
  barcode: string;
  inventory: number | null;
  quantity: number;
}

async function linesFor(gql: Gql, ids: string[], setting: DefaultQuantity, quantities?: Map<string, number>): Promise<Line[]> {
  const variants = await fetchVariantsForLabels(gql, await expandToVariantIds(gql, ids));
  return variants.map((v) => ({
    variantId: v.variantId,
    title: v.title,
    variantTitle: v.variantTitle && v.variantTitle !== "Default Title" ? v.variantTitle : "",
    sku: v.sku ?? "",
    barcode: v.barcode ?? "",
    inventory: v.inventoryQuantity,
    quantity: quantities?.get(v.variantId) ?? initialQuantity(setting, v.inventoryQuantity),
  }));
}

const asSetting = (value: string): DefaultQuantity => (value === "one" || value === "stock" ? value : "zero");

// Ouvert depuis l'admin (extension d'impression) avec ?ids=…, ou vide
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const settings = await getSettings(session.shop);
  const url = new URL(request.url);
  const ids = (url.searchParams.get("ids") ?? "").split(",").filter((id) => id.startsWith("gid://shopify/"));
  const templates = await listTemplates(session.shop);
  return {
    lines: ids.length ? await linesFor(gqlFromAdmin(admin), ids.slice(0, 250), asSetting(settings.defaultQuantity)) : [],
    templates: templates.map((t) => ({ id: t.id, name: t.name, sheet: t.format.kind === "sheet", hasRules: t.collectionIds.length > 0 })),
    defaultTemplateId: settings.defaultTemplateId ?? "builtin:dymo-30336",
    source: url.searchParams.get("source") ?? "product",
  };
};

// Ajout à la file : sélection du sélecteur Shopify ou filtre (F13)
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const gql = gqlFromAdmin(admin);
  const settings = await getSettings(session.shop);
  const form = await request.formData();
  let ids = String(form.get("ids") ?? "").split(",").filter(Boolean);
  let truncated = false;
  if (form.get("intent") === "filter") {
    const result = await fetchVariantIdsByFilter(gql, {
      collectionId: String(form.get("collectionId") ?? "") || undefined,
      vendor: String(form.get("vendor") ?? "") || undefined,
      productType: String(form.get("productType") ?? "") || undefined,
      createdSince: String(form.get("createdSince") ?? "") || undefined,
    });
    ids = result.ids;
    truncated = result.truncated;
  }
  return { lines: await linesFor(gql, ids, asSetting(settings.defaultQuantity)), truncated };
};

export default function Print() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [params, setParams] = useSearchParams();
  const [lines, setLines] = useState<Line[]>(data.lines);
  const [templateId, setTemplateId] = useState(data.templates.some((t) => t.hasRules) ? AUTO_TEMPLATE : data.defaultTemplateId);
  const [start, setStart] = useState({ row: 1, column: 1 });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "critical" | "warning"; text: string } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  // Ajoute les lignes reçues sans doublon
  useEffect(() => {
    if (!fetcher.data) return;
    setLines((current) => {
      const known = new Set(current.map((l) => l.variantId));
      return [...current, ...fetcher.data!.lines.filter((l) => !known.has(l.variantId))];
    });
    if (fetcher.data.truncated) setMessage({ tone: "warning", text: "Seules les 2 000 premières variantes ont été ajoutées." });
  }, [fetcher.data]);

  const total = useMemo(() => lines.reduce((sum, l) => sum + l.quantity, 0), [lines]);
  const isSheet = data.templates.find((t) => t.id === templateId)?.sheet ?? false;
  const setQuantity = (variantId: string, quantity: number) =>
    setLines((ls) => ls.map((l) => (l.variantId === variantId ? { ...l, quantity: Math.max(0, Math.min(MAX_PER_LINE, Math.floor(quantity) || 0)) } : l)));
  const setAll = (mode: "zero" | "one" | "stock") =>
    setLines((ls) => ls.map((l) => ({ ...l, quantity: initialQuantity(mode, l.inventory) })));

  async function pick() {
    const selection = await shopify.resourcePicker({ type: "product", multiple: true, action: "add" });
    if (!selection?.length) return;
    const ids = selection.flatMap((p) => {
      const variants = (p as { variants?: { id?: string }[] }).variants?.map((v) => v.id).filter(Boolean) as string[] | undefined;
      return variants?.length ? variants : [p.id];
    });
    fetcher.submit({ intent: "add", ids: ids.join(",") }, { method: "post" });
  }

  const body = (previewOnly: boolean) => ({
    lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
    templateId,
    start: isSheet ? start : undefined,
    source: data.source,
    preview: previewOnly,
  });

  async function showPreview() {
    setBusy(true);
    const result = await requestPrint(body(true));
    setBusy(false);
    if (result.error || !result.groups?.[0]) return setMessage({ tone: "critical", text: result.error ?? "Aperçu impossible" });
    setPreview(pdfUrl(result.groups[0].pdfBase64));
  }

  async function print() {
    setBusy(true);
    setMessage(null);
    const result = await requestPrint(body(false));
    setBusy(false);
    if (result.error || !result.groups) return setMessage({ tone: "critical", text: result.error ?? "Impression impossible" });
    for (const group of result.groups) await printPdfUrl(pdfUrl(group.pdfBase64)).catch(() => undefined);
    const warnings = result.groups.flatMap((g) => g.warnings);
    setMessage({
      tone: warnings.length ? "warning" : "success",
      text: `${result.groups.reduce((s, g) => s + g.labelCount, 0)} étiquettes envoyées à l'impression.${warnings.length ? ` ${warnings.join(". ")}.` : ""}`,
    });
    // La file se vide après chaque impression (F16) ; elle reste dans l'historique
    setLines([]);
    if (params.has("ids")) setParams({});
  }

  return (
    <s-page heading="Impression">
      {message && <s-banner tone={message.tone}>{message.text}</s-banner>}

      <s-section heading="Articles">
        <s-stack direction="inline" gap="base">
          <s-button onClick={pick}>Ajouter des produits</s-button>
          <s-button variant="tertiary" onClick={() => setAll("zero")}>Tout à 0</s-button>
          <s-button variant="tertiary" onClick={() => setAll("one")}>Tout à 1</s-button>
          <s-button variant="tertiary" onClick={() => setAll("stock")}>Tout au stock</s-button>
          {lines.length > 0 && <s-button variant="tertiary" tone="critical" onClick={() => setLines([])}>Vider</s-button>}
        </s-stack>

        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="filter" />
          <s-stack direction="inline" gap="base">
            <s-text-field name="vendor" label="Fournisseur"></s-text-field>
            <s-text-field name="productType" label="Type"></s-text-field>
            <s-date-field name="createdSince" label="Ajoutés depuis"></s-date-field>
            <s-button type="submit">Tout sélectionner</s-button>
          </s-stack>
        </fetcher.Form>

        {lines.length === 0 ? (
          <s-paragraph>Aucun article. Ajoutez des produits ou ouvrez cet écran depuis un bon de commande.</s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Article</s-table-header>
              <s-table-header>SKU</s-table-header>
              <s-table-header>Code-barres</s-table-header>
              <s-table-header>Stock</s-table-header>
              <s-table-header>Étiquettes</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {lines.map((l) => (
                <s-table-row key={l.variantId}>
                  <s-table-cell>{l.title}{l.variantTitle ? ` · ${l.variantTitle}` : ""}</s-table-cell>
                  <s-table-cell>{l.sku}</s-table-cell>
                  <s-table-cell>{l.barcode || "à créer"}</s-table-cell>
                  <s-table-cell>{l.inventory ?? ""}</s-table-cell>
                  <s-table-cell>
                    <s-number-field
                      label="Quantité"
                      labelAccessibilityVisibility="exclusive"
                      min={0}
                      max={MAX_PER_LINE}
                      value={String(l.quantity)}
                      onChange={(e) => setQuantity(l.variantId, Number(e.currentTarget.value))}
                    ></s-number-field>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-section heading="Modèle">
        <s-select label="Modèle d'étiquette" value={templateId} onChange={(e) => setTemplateId(e.currentTarget.value)}>
          {data.templates.some((t) => t.hasRules) && <s-option value={AUTO_TEMPLATE}>Automatique selon la collection</s-option>}
          {data.templates.map((t) => (
            <s-option key={t.id} value={t.id}>{t.name}</s-option>
          ))}
        </s-select>
        {isSheet && (
          <s-stack direction="inline" gap="base">
            <s-number-field label="Ligne de départ" min={1} value={String(start.row)} onChange={(e) => setStart((s) => ({ ...s, row: Number(e.currentTarget.value) || 1 }))}></s-number-field>
            <s-number-field label="Colonne de départ" min={1} value={String(start.column)} onChange={(e) => setStart((s) => ({ ...s, column: Number(e.currentTarget.value) || 1 }))}></s-number-field>
          </s-stack>
        )}
      </s-section>

      <s-section heading={`${total} étiquettes`}>
        <s-stack direction="inline" gap="base">
          <s-button variant="primary" disabled={busy || total === 0} onClick={print}>Imprimer</s-button>
          <s-button disabled={busy || total === 0} onClick={showPreview}>Aperçu</s-button>
        </s-stack>
        {preview && <iframe title="Aperçu" src={preview} style={{ width: "100%", height: 320, border: "1px solid #ddd" }} />}
      </s-section>
    </s-page>
  );
}
