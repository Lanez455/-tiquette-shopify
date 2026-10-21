import { useEffect, useMemo, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useSearchParams } from "react-router";
import { authenticate } from "../shopify.server";
import { listTemplates } from "../lib/labels/templates.server";
import { AUTO_TEMPLATE, initialQuantity, MAX_PER_LINE, type DefaultQuantity } from "../lib/print/job";
import { pdfUrl, printPdfUrl, requestPrint } from "../lib/print/client";
import { sendDirect } from "../lib/print/direct";
import { getSettings } from "../lib/settings.server";
import { expandToVariantIds, fetchVariantIdsByFilter, fetchVariantsForLabels } from "../lib/shopify/catalog";
import { gqlFromAdmin, type Gql } from "../lib/shopify/graphql";
import { docKind, inventoryDocLines, listInventoryDocs, type InventoryDoc } from "../lib/shopify/inventoryDocs";
import { parseLabelCsv } from "../lib/import/csv";
import { matchCsvRows } from "../lib/import/match";
import { parseLinesParam } from "../lib/print/links.server";
import { currentPlan, PlanLimitError, requireFeature } from "../lib/billing/plans";

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
  // Lignes déjà chiffrées, venues de la réception par scan (F18)
  let given: { variantId: string; quantity: number }[] = [];
  try {
    if (url.searchParams.get("lines")) given = parseLinesParam(url.searchParams.get("lines")).slice(0, 250);
  } catch {
    given = [];
  }
  // Bons de commande et transferts récents (F14) ; absents si l'accès n'est pas accordé
  const docs: InventoryDoc[] = await listInventoryDocs(gqlFromAdmin(admin)).catch(() => []);
  return {
    docs,
    lines: given.length
      ? await linesFor(gqlFromAdmin(admin), given.map((l) => l.variantId), "zero", new Map(given.map((l) => [l.variantId, l.quantity])))
      : ids.length
        ? await linesFor(gqlFromAdmin(admin), ids.slice(0, 250), asSetting(settings.defaultQuantity))
        : [],
    templates: templates.map((t) => ({ id: t.id, name: t.name, sheet: t.format.kind === "sheet", hasRules: t.collectionIds.length > 0 })),
    defaultTemplateId: settings.defaultTemplateId ?? "builtin:dymo-30336",
    source: url.searchParams.get("source") ?? "product",
    printMethod: settings.printMethod === "zebra" || settings.printMethod === "dymo" ? settings.printMethod : "pdf",
  };
};

interface AddResult {
  lines: Line[];
  truncated?: boolean;
  source?: string;
  notice?: string;
  problems?: { line: number; key: string; message: string }[];
}

// Ajout à la file : sélection, filtre (F13), bon de commande, transfert ou CSV (F14)
export const action = async ({ request }: ActionFunctionArgs): Promise<AddResult> => {
  const { admin, session } = await authenticate.admin(request);
  const gql = gqlFromAdmin(admin);
  const settings = await getSettings(session.shop);
  const form = await request.formData();
  const intent = form.get("intent");

  try {
    const plan = await currentPlan(gql, session.shop);
    if (intent === "document") requireFeature(plan, "purchase_orders");
    if (intent === "csv") requireFeature(plan, "csv");
  } catch (error) {
    if (error instanceof PlanLimitError) return { lines: [], notice: error.message };
    throw error;
  }

  if (intent === "document") {
    const id = String(form.get("docId") ?? "");
    const kind = docKind(id);
    if (!kind) return { lines: [], notice: "Choisissez un bon de commande ou un transfert." };
    const doc = await inventoryDocLines(gql, id);
    const quantities = new Map(doc.lines.map((l) => [l.variantId, l.quantity]));
    return {
      lines: await linesFor(gql, doc.lines.map((l) => l.variantId), "zero", quantities),
      source: kind,
      notice: `${doc.name} : ${doc.lines.length} articles ajoutés${doc.skipped ? `, ${doc.skipped} article(s) supprimé(s) ignoré(s)` : ""}.`,
    };
  }

  if (intent === "csv") {
    const parsed = parseLabelCsv(String(form.get("csv") ?? ""));
    const matched = await matchCsvRows(gql, parsed.rows);
    const quantities = new Map(matched.lines.map((l) => [l.variantId, l.quantity]));
    const problems = [...parsed.errors.map((e) => ({ ...e, key: "" })), ...matched.problems].sort((a, b) => a.line - b.line);
    return {
      lines: matched.lines.length ? await linesFor(gql, matched.lines.map((l) => l.variantId), "zero", quantities) : [],
      source: "csv",
      notice: `${matched.lines.length} articles trouvés dans le fichier.`,
      problems,
    };
  }

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
  const [source, setSource] = useState(data.source);
  const [docId, setDocId] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "critical" | "warning"; text: string } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  // Ajoute les lignes reçues ; un article déjà présent prend la quantité du document
  useEffect(() => {
    const result = fetcher.data;
    if (!result) return;
    setLines((current) => {
      const incoming = new Map(result.lines.map((l) => [l.variantId, l]));
      const kept = current.map((l) => (result.source && incoming.has(l.variantId) ? { ...l, quantity: incoming.get(l.variantId)!.quantity } : l));
      const known = new Set(current.map((l) => l.variantId));
      return [...kept, ...result.lines.filter((l) => !known.has(l.variantId))];
    });
    if (result.source) setSource(result.source);
    if (result.truncated) setMessage({ tone: "warning", text: "Seules les 2 000 premières variantes ont été ajoutées." });
    else if (result.notice) {
      const problems = result.problems ?? [];
      const detail = problems.slice(0, 8).map((p) => `ligne ${p.line}${p.key ? ` (${p.key})` : ""} : ${p.message}`).join(" ; ");
      setMessage({
        tone: problems.length ? "warning" : "success",
        text: `${result.notice}${problems.length ? ` ${problems.length} ligne(s) à revoir : ${detail}${problems.length > 8 ? " ; …" : ""}` : ""}`,
      });
    }
  }, [fetcher.data]);

  async function importCsv(file: File | undefined) {
    if (!file) return;
    if (file.size > 2_000_000) return setMessage({ tone: "critical", text: "Fichier trop lourd (2 Mo au maximum)." });
    fetcher.submit({ intent: "csv", csv: await file.text() }, { method: "post" });
  }

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
    source,
    preview: previewOnly,
  });

  async function showPreview() {
    setBusy(true);
    const result = await requestPrint(body(true));
    setBusy(false);
    if (result.error || !result.groups?.[0]) return setMessage({ tone: "critical", text: result.error ?? "Aperçu impossible" });
    setPreview(pdfUrl(result.groups[0].pdfBase64));
  }

  const done = (count: number, warnings: string[], note = "") => {
    setMessage({
      tone: warnings.length || note ? "warning" : "success",
      text: `${count} étiquettes envoyées à l'impression.${note ? ` ${note}` : ""}${warnings.length ? ` ${warnings.join(". ")}.` : ""}`,
    });
    // La file se vide après chaque impression (F16) ; elle reste dans l'historique
    setLines([]);
    setSource("product");
    if (params.has("ids") || params.has("lines")) setParams({});
  };

  async function print() {
    setBusy(true);
    setMessage(null);
    let note = "";
    let fallbackJobId: string | undefined;

    // Impression directe (F17) ; en cas d'échec, repli automatique sur le PDF
    const isIpad = /iPad|Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
    if (data.printMethod !== "pdf" && !isIpad) {
      const printer = data.printMethod === "zebra" ? "Zebra" : "Dymo";
      const direct = await requestPrint({ ...body(false), output: data.printMethod === "zebra" ? "zpl" : "dymo" });
      if (direct.direct) {
        try {
          await sendDirect(direct.direct);
          setBusy(false);
          return done(direct.direct.reduce((s, g) => s + g.labelCount, 0), direct.direct.flatMap((g) => g.warnings));
        } catch (error) {
          note = `${printer} injoignable (${error instanceof Error ? error.message : "erreur"}) : impression en PDF.`;
          fallbackJobId = direct.jobId;
        }
      } else {
        note = `${direct.error ?? `Impression ${printer} impossible`} Impression en PDF.`;
      }
    }

    const result = await requestPrint(
      fallbackJobId ? { reprintJobId: fallbackJobId, fallback: true, start: body(false).start } : body(false),
    );
    setBusy(false);
    if (result.error || !result.groups) return setMessage({ tone: "critical", text: result.error ?? "Impression impossible" });
    for (const group of result.groups) await printPdfUrl(pdfUrl(group.pdfBase64)).catch(() => undefined);
    done(result.groups.reduce((s, g) => s + g.labelCount, 0), result.groups.flatMap((g) => g.warnings), note);
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

        <s-stack direction="inline" gap="base">
          {data.docs.length > 0 && (
            <>
              <s-select label="Bon de commande ou transfert" value={docId} onChange={(e) => setDocId(e.currentTarget.value)}>
                <s-option value="">Choisir…</s-option>
                {data.docs.map((d) => (
                  <s-option key={d.id} value={d.id}>
                    {`${d.kind === "purchase_order" ? "Bon de commande" : "Transfert"} ${d.name}${d.dateCreated ? ` · ${d.dateCreated.slice(0, 10)}` : ""}`}
                  </s-option>
                ))}
              </s-select>
              <s-button disabled={!docId} onClick={() => fetcher.submit({ intent: "document", docId }, { method: "post" })}>
                Ajouter ses articles
              </s-button>
            </>
          )}
          <label>
            Importer un CSV (code-barres ou SKU, quantité){" "}
            <input type="file" accept=".csv,.txt,text/csv" onChange={(e) => importCsv(e.currentTarget.files?.[0])} />
          </label>
        </s-stack>

        {lines.length === 0 ? (
          <s-paragraph>Aucun article. Ajoutez des produits, un bon de commande, un transfert ou un fichier CSV.</s-paragraph>
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
