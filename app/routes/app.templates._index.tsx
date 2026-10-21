import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, redirect, useActionData, useLoaderData } from "react-router";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { can, currentPlan, FREE_CUSTOM_TEMPLATES, PlanLimitError } from "../lib/billing/plans";
import { gqlFromAdmin } from "../lib/shopify/graphql";
import { defaultLayout } from "../lib/labels/defaultLayouts";
import { customFormat, FORMATS, getFormat } from "../lib/labels/formats";
import { listTemplates } from "../lib/labels/templates.server";
import { inToMm } from "../lib/labels/units";
import { getSettings } from "../lib/settings.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [templates, settings] = await Promise.all([listTemplates(session.shop), getSettings(session.shop)]);
  return {
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      builtin: t.builtin,
      size: `${t.format.widthMm.toFixed(1)} × ${t.format.heightMm.toFixed(1)} mm`,
      collections: t.collectionIds.length,
    })),
    formats: FORMATS.map((f) => ({ id: f.id, name: f.name })),
    defaultTemplateId: settings.defaultTemplateId ?? "builtin:dymo-30336",
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "default") {
    const templateId = String(form.get("templateId"));
    await prisma.shopSettings.upsert({ where: { shop: session.shop }, create: { shop: session.shop, defaultTemplateId: templateId }, update: { defaultTemplateId: templateId } });
    return { message: "Modèle par défaut enregistré." };
  }

  // Formule Gratuit : un seul modèle personnalisé
  const plan = await currentPlan(gqlFromAdmin(admin), session.shop);
  if (!can(plan, "unlimited_templates") && (await prisma.labelTemplate.count({ where: { shop: session.shop } })) >= FREE_CUSTOM_TEMPLATES) {
    return { error: new PlanLimitError("unlimited_templates").message };
  }

  // Création : à partir d'un format prêt, ou d'une taille libre (F1)
  let format;
  try {
    if (intent === "custom") {
      const unit = form.get("unit") === "in" ? inToMm : (v: number) => v;
      format = customFormat(unit(Number(form.get("width"))), unit(Number(form.get("height"))), form.get("shape") === "round" ? "round" : "rect");
    } else {
      format = getFormat(String(form.get("formatId")));
    }
  } catch (error) {
    return { error: (error as Error).message };
  }
  if (!format) return { error: "Format inconnu" };
  const row = await prisma.labelTemplate.create({
    data: {
      shop: session.shop,
      name: String(form.get("name") || format.name),
      formatId: format.id,
      widthMm: format.widthMm,
      heightMm: format.heightMm,
      shape: format.shape,
      layoutJson: JSON.stringify(defaultLayout(format)),
    },
  });
  throw redirect(`/app/templates/${row.id}`);
};

export default function Templates() {
  const data = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  return (
    <s-page heading="Modèles">
      {result && "error" in result && <s-banner tone="critical">{result.error}</s-banner>}
      {result && "message" in result && <s-banner tone="success">{result.message}</s-banner>}

      <s-section heading="Vos modèles">
        <s-table>
          <s-table-header-row>
            <s-table-header>Nom</s-table-header>
            <s-table-header>Taille</s-table-header>
            <s-table-header>Collections</s-table-header>
            <s-table-header></s-table-header>
          </s-table-header-row>
          <s-table-body>
            {data.templates.map((t) => (
              <s-table-row key={t.id}>
                <s-table-cell>
                  {t.builtin ? t.name : <s-link href={`/app/templates/${t.id}`}>{t.name}</s-link>}
                  {t.id === data.defaultTemplateId && " (par défaut)"}
                </s-table-cell>
                <s-table-cell>{t.size}</s-table-cell>
                <s-table-cell>{t.collections || ""}</s-table-cell>
                <s-table-cell>
                  {t.id !== data.defaultTemplateId && (
                    <Form method="post">
                      <input type="hidden" name="intent" value="default" />
                      <input type="hidden" name="templateId" value={t.id} />
                      <s-button type="submit" variant="tertiary">Par défaut</s-button>
                    </Form>
                  )}
                </s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      </s-section>

      <s-section heading="Nouveau modèle à partir d'un format prêt">
        <Form method="post">
          <input type="hidden" name="intent" value="format" />
          <s-stack direction="inline" gap="base">
            <s-select name="formatId" label="Format">
              {data.formats.map((f) => (
                <s-option key={f.id} value={f.id}>{f.name}</s-option>
              ))}
            </s-select>
            <s-text-field name="name" label="Nom (facultatif)"></s-text-field>
            <s-button type="submit" variant="primary">Créer et modifier</s-button>
          </s-stack>
        </Form>
      </s-section>

      <s-section heading="Nouveau modèle en taille libre">
        <Form method="post">
          <input type="hidden" name="intent" value="custom" />
          <s-stack direction="inline" gap="base">
            <s-number-field name="width" label="Largeur" min={5} max={300} step={0.1}></s-number-field>
            <s-number-field name="height" label="Hauteur" min={5} max={300} step={0.1}></s-number-field>
            <s-select name="unit" label="Unité">
              <s-option value="mm">mm</s-option>
              <s-option value="in">pouces</s-option>
            </s-select>
            <s-select name="shape" label="Forme">
              <s-option value="rect">Rectangle</s-option>
              <s-option value="round">Rond</s-option>
            </s-select>
            <s-text-field name="name" label="Nom"></s-text-field>
            <s-button type="submit">Créer et modifier</s-button>
          </s-stack>
        </Form>
      </s-section>
    </s-page>
  );
}
