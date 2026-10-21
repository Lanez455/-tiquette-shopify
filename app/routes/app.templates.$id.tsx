import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect, useActionData, useLoaderData, useNavigation, useSubmit } from "react-router";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { LabelEditor } from "../components/LabelEditor";
import { SAMPLE } from "../lib/labels/editorOps";
import { renderLabels } from "../lib/labels/pdf.server";
import { resolveTemplate } from "../lib/labels/templates.server";
import type { LabelTemplateLayout } from "../lib/labels/template";
import { LayoutError, validateLayout } from "../lib/labels/validateLayout";
import { pdfUrl } from "../lib/print/client";
import { getSettings } from "../lib/settings.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const template = await resolveTemplate(session.shop, params.id!);
  return {
    id: template.id,
    name: template.name,
    widthMm: template.format.widthMm,
    heightMm: template.format.heightMm,
    layout: template.layout,
    collectionIds: template.collectionIds,
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const template = await resolveTemplate(session.shop, params.id!);
  const form = await request.formData();
  const intent = form.get("intent");
  if (template.builtin && intent !== "preview") {
    return { error: "Les formats prêts ne se modifient pas : créez un modèle à partir de ce format." };
  }

  if (intent === "delete") {
    await prisma.labelTemplate.deleteMany({ where: { shop: session.shop, id: template.id } });
    const settings = await getSettings(session.shop);
    if (settings.defaultTemplateId === template.id) {
      await prisma.shopSettings.update({ where: { shop: session.shop }, data: { defaultTemplateId: null } });
    }
    throw redirect("/app/templates");
  }

  let layout: LabelTemplateLayout;
  try {
    layout = validateLayout(JSON.parse(String(form.get("layout"))), template.format.widthMm, template.format.heightMm);
  } catch (error) {
    if (error instanceof LayoutError || error instanceof SyntaxError) return { error: error.message };
    throw error;
  }

  if (intent === "preview") {
    const { pdf, overflows, barcodeTooWide } = await renderLabels({
      format: template.format,
      layout,
      items: [{ ...SAMPLE, title: SAMPLE.title!, price: "29.90", compareAtPrice: "39.90", barcode: "2000000001234", productUrl: "https://exemple.com/products/exemple" }],
      price: { currency: "EUR", locale: "fr-FR" },
      // Sur planche, l'aperçu montre la page entière
    });
    const warnings = [
      ...(overflows.length ? ["Un texte est trop long, même à la taille minimale."] : []),
      ...(barcodeTooWide.length ? ["Le code-barres est trop large pour sa zone."] : []),
    ];
    return { pdfBase64: Buffer.from(pdf).toString("base64"), warnings };
  }

  const collectionIds = String(form.get("collectionIds") ?? "").split(",").filter((id) => id.startsWith("gid://shopify/Collection/"));
  await prisma.labelTemplate.updateMany({
    where: { shop: session.shop, id: template.id },
    data: { name: String(form.get("name") || template.name), layoutJson: JSON.stringify(layout), collectionIds: collectionIds.join(",") },
  });
  return { message: "Modèle enregistré." };
};

export default function TemplateEditor() {
  const data = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const busy = useNavigation().state !== "idle";
  const [layout, setLayout] = useState(data.layout);
  const [collections, setCollections] = useState<string[]>(data.collectionIds);
  const [name, setName] = useState(data.name);
  // La suppression est définitive : elle se confirme en deux temps
  const [confirmDelete, setConfirmDelete] = useState(false);
  const submit = useSubmit();
  const send = (intent: "save" | "preview" | "delete") =>
    submit({ intent, name, layout: JSON.stringify(layout), collectionIds: collections.join(",") }, { method: "post" });

  async function pickCollections() {
    const selection = await shopify.resourcePicker({
      type: "collection",
      multiple: true,
      action: "select",
      selectionIds: collections.map((id) => ({ id })),
    });
    if (selection) setCollections(selection.map((c) => c.id));
  }

  return (
    <s-page heading={data.name}>
      <s-link slot="breadcrumb-actions" href="/app/templates">Modèles</s-link>
      {result && "error" in result && <s-banner tone="critical">{result.error}</s-banner>}
      {result && "message" in result && <s-banner tone="success">{result.message}</s-banner>}
      {result && "warnings" in result && result.warnings?.map((w) => <s-banner key={w} tone="warning">{w}</s-banner>)}

      <>
        <s-section heading={`Étiquette ${data.widthMm.toFixed(1)} × ${data.heightMm.toFixed(1)} mm`}>
          <s-text-field label="Nom" value={name} onChange={(e) => setName(e.currentTarget.value)}></s-text-field>
          <LabelEditor bounds={{ widthMm: data.widthMm, heightMm: data.heightMm }} layout={layout} onChange={setLayout} />
        </s-section>

        <s-section heading="Collections">
          <s-paragraph>
            Les produits de ces collections sortent automatiquement sur ce modèle
            {collections.length ? ` (${collections.length} collections)` : ""}.
          </s-paragraph>
          <s-button onClick={pickCollections}>Choisir les collections</s-button>
        </s-section>

        <s-section>
          <s-stack direction="inline" gap="base">
            <s-button variant="primary" disabled={busy} onClick={() => send("save")}>Enregistrer</s-button>
            <s-button disabled={busy} onClick={() => send("preview")}>Aperçu PDF</s-button>
            <s-button tone="critical" disabled={busy || confirmDelete} onClick={() => setConfirmDelete(true)}>Supprimer</s-button>
          </s-stack>
          {confirmDelete && (
            <s-banner tone="critical" heading={`Supprimer « ${data.name} » ?`}>
              <s-paragraph>
                Le modèle et ses règles de collection seront effacés. Les réimpressions qui l'utilisaient ne fonctionneront plus.
              </s-paragraph>
              <s-stack direction="inline" gap="base">
                <s-button tone="critical" variant="primary" disabled={busy} onClick={() => send("delete")}>Supprimer définitivement</s-button>
                <s-button disabled={busy} onClick={() => setConfirmDelete(false)}>Annuler</s-button>
              </s-stack>
            </s-banner>
          )}
          {result && "pdfBase64" in result && result.pdfBase64 && (
            <iframe title="Aperçu" src={pdfUrl(result.pdfBase64)} style={{ width: "100%", height: 320, border: "1px solid #ddd" }} />
          )}
        </s-section>
      </>
    </s-page>
  );
}
