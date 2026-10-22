import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { useEffect } from "react";
import { authenticate } from "../shopify.server";
import { FREE_CUSTOM_TEMPLATES, FREE_MONTHLY_LABELS, forgetPlan, MAGASIN, PLAN_NAMES, PLAN_PRICES, planFromSubscriptions, PRO } from "../lib/billing/plans";
import { labelsUsedThisMonth } from "../lib/billing/usage.server";
import { useT } from "../lib/i18n/react";

// Les abonnements de test ne sont pas facturés : actifs tant que BILLING_TEST ne vaut pas « false »
const isTest = () => process.env.BILLING_TEST !== "false";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  // Retour de la page de validation Shopify : la formule en cache est périmée
  forgetPlan(session.shop);
  const { appSubscriptions } = await billing.check({ plans: [PRO, MAGASIN], isTest: isTest() });
  const plan = planFromSubscriptions(appSubscriptions.map((s) => ({ name: s.name, status: s.status })));
  return { plan, used: await labelsUsedThisMonth(session.shop) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const form = await request.formData();
  const wanted = String(form.get("plan"));
  forgetPlan(session.shop);
  const { appSubscriptions } = await billing.check({ plans: [PRO, MAGASIN], isTest: isTest() });
  if (wanted === "free") {
    for (const s of appSubscriptions) await billing.cancel({ subscriptionId: s.id, isTest: isTest(), prorate: true });
    return { message: "Vous êtes passé à la formule Gratuit." };
  }
  if (wanted !== PRO && wanted !== MAGASIN) return { message: "Formule inconnue" };
  // Shopify affiche sa page de validation, puis remplace l'ancienne formule.
  // Pour un envoi depuis l'app, la bibliothèque lève une réponse 401 qui porte
  // l'adresse de validation dans un en-tête ; elle ne parvient pas jusqu'à App
  // Bridge, donc on renvoie l'adresse à la page, qui l'ouvre elle-même.
  try {
    return await billing.request({ plan: wanted, isTest: isTest() });
  } catch (e) {
    const confirmationUrl = e instanceof Response ? e.headers.get(REAUTH_URL_HEADER) : null;
    if (confirmationUrl) return { confirmationUrl };
    throw e;
  }
};

const REAUTH_URL_HEADER = "X-Shopify-API-Request-Failure-Reauthorize-Url";

const PLANS = [
  { id: "free", name: "Gratuit", price: 0, features: [`${FREE_MONTHLY_LABELS} étiquettes par mois`, "Formats prêts", `${FREE_CUSTOM_TEMPLATES} modèle personnalisé`, "Codes-barres uniques"] },
  { id: PRO, name: PRO, price: PLAN_PRICES[PRO], features: ["Étiquettes illimitées", "Éditeur complet, modèles illimités", "Bons de commande, transferts, CSV"] },
  { id: MAGASIN, name: MAGASIN, price: PLAN_PRICES[MAGASIN], features: ["Tout Pro", "Plusieurs magasins et réception par scan", "Tuile en caisse", "Impression directe Zebra et Dymo", "Support prioritaire"] },
] as const;

const PLAN_ID = { free: "free", pro: PRO, store: MAGASIN } as const;

export default function Plans() {
  const t = useT();
  const { plan, used } = useLoaderData<typeof loader>();
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
      {PLANS.map((p) => (
        <s-section key={p.id} heading={`${t(p.name)} · ${p.price ? t("{price} $ par mois", { price: p.price }) : t("0 $")}`}>
          <s-unordered-list>
            {p.features.map((f) => (
              <s-list-item key={f}>{t(f)}</s-list-item>
            ))}
          </s-unordered-list>
          {PLAN_ID[plan] === p.id ? (
            <s-badge tone="success">{t("Formule actuelle")}</s-badge>
          ) : (
            <Form method="post">
              <input type="hidden" name="plan" value={p.id} />
              <s-button type="submit" variant={p.id === "free" ? "secondary" : "primary"} disabled={busy}>
                {p.id === "free" ? t("Revenir au Gratuit") : t("Choisir {plan}", { plan: t(p.name) })}
              </s-button>
            </Form>
          )}
        </s-section>
      ))}
    </s-page>
  );
}
