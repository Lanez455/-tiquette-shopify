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
import { pickLang, translate } from "../lib/i18n";
import { useLang, useT } from "../lib/i18n/react";

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
      // Nom par défaut dans la langue de l'écran
      name: String(form.get("name") || translate(pickLang(String(form.get("lang") ?? "")) ?? "fr", format.name)),
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
  const t = useT();
  const lang = useLang();
  const data = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  return (
    <s-page heading={t("Modèles")}>
      {result && "error" in result && <s-banner tone="critical">{t(result.error)}</s-banner>}
      {result && "message" in result && <s-banner tone="success">{t(result.message)}</s-banner>}

      <s-section heading={t("Vos modèles")}>
        <s-table>
          <s-table-header-row>
            <s-table-header>{t("Nom")}</s-table-header>
            <s-table-header>{t("Taille")}</s-table-header>
            <s-table-header>{t("Collections")}</s-table-header>
            <s-table-header></s-table-header>
          </s-table-header-row>
          <s-table-body>
            {data.templates.map((tpl) => (
              <s-table-row key={tpl.id}>
                <s-table-cell>
                  {tpl.builtin ? t(tpl.name) : <s-link href={`/app/templates/${tpl.id}`}>{tpl.name}</s-link>}
                  {tpl.id === data.defaultTemplateId && ` ${t("(par défaut)")}`}
                </s-table-cell>
                <s-table-cell>{tpl.size}</s-table-cell>
                <s-table-cell>{tpl.collections || ""}</s-table-cell>
                <s-table-cell>
                  {tpl.id !== data.defaultTemplateId && (
                    <Form method="post">
                      <input type="hidden" name="intent" value="default" />
                      <input type="hidden" name="templateId" value={tpl.id} />
                      <s-button type="submit" variant="tertiary">{t("Par défaut")}</s-button>
                    </Form>
                  )}
                </s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      </s-section>

      <s-section heading={t("Nouveau modèle à partir d'un format prêt")}>
        <Form method="post">
          <input type="hidden" name="intent" value="format" />
          <input type="hidden" name="lang" value={lang} />
          <s-stack direction="inline" gap="base">
            <s-select name="formatId" label={t("Format")}>
              {data.formats.map((f) => (
                <s-option key={f.id} value={f.id}>{t(f.name)}</s-option>
              ))}
            </s-select>
            <s-text-field name="name" label={t("Nom (facultatif)")}></s-text-field>
            <s-button type="submit" variant="primary">{t("Créer et modifier")}</s-button>
          </s-stack>
        </Form>
      </s-section>

      <s-section heading={t("Nouveau modèle en taille libre")}>
        <Form method="post">
          <input type="hidden" name="intent" value="custom" />
          <input type="hidden" name="lang" value={lang} />
          <s-stack direction="inline" gap="base">
            <s-number-field name="width" label={t("Largeur")} min={5} max={300} step={0.1}></s-number-field>
            <s-number-field name="height" label={t("Hauteur")} min={5} max={300} step={0.1}></s-number-field>
            <s-select name="unit" label={t("Unité")}>
              <s-option value="mm">mm</s-option>
              <s-option value="in">{t("pouces")}</s-option>
            </s-select>
            <s-select name="shape" label={t("Forme")}>
              <s-option value="rect">{t("Rectangle")}</s-option>
              <s-option value="round">{t("Rond")}</s-option>
            </s-select>
            <s-text-field name="name" label={t("Nom")}></s-text-field>
            <s-button type="submit">{t("Créer et modifier")}</s-button>
          </s-stack>
        </Form>
      </s-section>
    </s-page>
  );
}
