import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { useEffect } from "react";
import { authenticate } from "../shopify.server";
import { ALL_SUBSCRIPTIONS, annualDiscount, FREE_CUSTOM_TEMPLATES, FREE_MONTHLY_LABELS, forgetPlan, MAGASIN, MAGASIN_ANNUAL, isPaidPlan, PLAN_NAMES, PLAN_PRICES, planFromSubscriptions, PRO, PRO_ANNUAL, trialDaysLeft } from "../lib/billing/plans";
import { labelsUsedThisMonth } from "../lib/billing/usage.server";
import { useT } from "../lib/i18n/react";
import { gqlFromAdmin, type Gql } from "../lib/shopify/graphql";

// Les abonnements de test ne sont pas facturés : actifs tant que BILLING_TEST ne vaut pas « false »
const isTest = () => process.env.BILLING_TEST !== "false";

async function trialLeft(gql: Gql) {
  const data = await gql<{ currentAppInstallation: { allSubscriptions: { nodes: { status: string; createdAt: string }[] } } }>(ALL_SUBSCRIPTIONS);
  return trialDaysLeft(data.currentAppInstallation.allSubscriptions.nodes);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, billing, session } = await authenticate.admin(request);
  // Retour de la page de validation Shopify : la formule en cache est périmée
  forgetPlan(session.shop);
  // Toutes les formules, y compris les abonnements « Magasin » créés avant le changement de nom
  const { appSubscriptions } = await billing.check({ isTest: isTest() });
  const plan = planFromSubscriptions(appSubscriptions.map((s) => ({ name: s.name, status: s.status })));
  const annual = appSubscriptions.some((s) => s.status === "ACTIVE" && (s.name === PRO_ANNUAL || s.name === MAGASIN_ANNUAL));
  return { plan, annual, trialDays: await trialLeft(gqlFromAdmin(admin)), used: await labelsUsedThisMonth(session.shop) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, billing, session } = await authenticate.admin(request);
  const form = await request.formData();
  const wanted = String(form.get("plan"));
  forgetPlan(session.shop);
  const { appSubscriptions } = await billing.check({ isTest: isTest() });
  if (wanted === "free") {
    for (const s of appSubscriptions) await billing.cancel({ subscriptionId: s.id, isTest: isTest(), prorate: true });
    return { message: "Vous êtes passé à la formule Gratuit." };
  }
  if (!isPaidPlan(wanted)) return { message: "Formule inconnue" };
  // Shopify affiche sa page de validation, puis remplace l'ancienne formule.
  // Pour un envoi depuis l'app, la bibliothèque lève une réponse 401 qui porte
  // l'adresse de validation dans un en-tête ; elle ne parvient pas jusqu'à App
  // Bridge, donc on renvoie l'adresse à la page, qui l'ouvre elle-même.
  try {
    return await billing.request({ plan: wanted, isTest: isTest(), trialDays: await trialLeft(gqlFromAdmin(admin)) });
  } catch (e) {
    const confirmationUrl = e instanceof Response ? e.headers.get(REAUTH_URL_HEADER) : null;
    if (confirmationUrl) return { confirmationUrl };
    throw e;
  }
};

const REAUTH_URL_HEADER = "X-Shopify-API-Request-Failure-Reauthorize-Url";

const PLANS = [
  { id: "free", name: "Gratuit", price: 0, features: [`${FREE_MONTHLY_LABELS} étiquettes par mois`, "Formats prêts", `${FREE_CUSTOM_TEMPLATES} modèle personnalisé`, "Codes-barres uniques", "Bons de commande et transferts"] },
  { id: PRO, name: PRO, price: PLAN_PRICES[PRO], annualId: PRO_ANNUAL, annualPrice: PLAN_PRICES[PRO_ANNUAL], features: ["Étiquettes illimitées", "Éditeur complet, modèles illimités", "Import CSV"] },
  { id: MAGASIN, name: "Magasin", price: PLAN_PRICES[MAGASIN], annualId: MAGASIN_ANNUAL, annualPrice: PLAN_PRICES[MAGASIN_ANNUAL], features: ["Tout Pro", "Plusieurs magasins et réception par scan", "Tuile en caisse", "Impression directe Zebra et Dymo", "Support prioritaire"] },
] as const;

const PLAN_ID = { free: "free", pro: PRO, store: MAGASIN } as const;

export default function Plans() {
  const t = useT();
  const { plan, annual, trialDays, used } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const busy = useNavigation().state !== "idle";
  const confirmationUrl = result && "confirmationUrl" in result ? result.confirmationUrl : null;
  useEffect(() => {
    // Page de validation de Shopify, en dehors de l'iframe de l'app
    if (confirmationUrl) window.open(confirmationUrl, "_top");
  }, [confirmationUrl]);
  return (
    <s-page heading={t("Formules")}>
      {result && "message" in result && <s-banner tone="info">{t(result.message)}</s-banner>}
      <s-section>
        <s-paragraph>
          {t("Formule actuelle : {plan}.", { plan: t(PLAN_NAMES[plan]) })}{" "}
          {plan === "free"
            ? t("{used} étiquettes sur {max} utilisées ce mois-ci.", { used, max: FREE_MONTHLY_LABELS })
            : t("{used} étiquettes imprimées ce mois-ci.", { used })}
        </s-paragraph>
      </s-section>
      {PLANS.map((p) => {
        const current = PLAN_ID[plan] === p.id;
        const choose = (id: string, label: string, variant: "primary" | "secondary") => (
          <Form method="post">
            <input type="hidden" name="plan" value={id} />
            <s-button type="submit" variant={variant} disabled={busy}>{label}</s-button>
          </Form>
        );
        return (
          <s-section key={p.id} heading={`${t(p.name)} · ${p.price ? t("{price} $ par mois", { price: p.price }) : t("0 $")}`}>
            <s-unordered-list>
              {p.features.map((f) => (
                <s-list-item key={f}>{t(f)}</s-list-item>
              ))}
            </s-unordered-list>
            {"annualId" in p && (
              <s-paragraph>
                {t("Ou {price} $ par an (-{pct} %).", { price: p.annualPrice, pct: annualDiscount(p.price, p.annualPrice) })}
                {plan === "free" && trialDays > 0 ? ` ${t("{n} jours d'essai gratuit.", { n: trialDays })}` : ""}
              </s-paragraph>
            )}
            <s-stack direction="inline" gap="base">
              {current && <s-badge tone="success">{t(annual ? "Formule actuelle, à l'année" : "Formule actuelle")}</s-badge>}
              {!("annualId" in p)
                ? !current && choose("free", t("Revenir au Gratuit"), "secondary")
                : <>
                    {!(current && !annual) && choose(p.id, t("Choisir {plan} au mois", { plan: t(p.name) }), "primary")}
                    {!(current && annual) && choose(p.annualId, t("Choisir {plan} à l'année", { plan: t(p.name) }), "secondary")}
                  </>}
            </s-stack>
          </s-section>
        );
      })}
    </s-page>
  );
}
