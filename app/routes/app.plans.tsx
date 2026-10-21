import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import { FREE_CUSTOM_TEMPLATES, FREE_MONTHLY_LABELS, forgetPlan, MAGASIN, PLAN_NAMES, PLAN_PRICES, planFromSubscriptions, PRO } from "../lib/billing/plans";
import { labelsUsedThisMonth } from "../lib/billing/usage.server";

// Les abonnements de test ne sont pas facturés : actifs tant que BILLING_TEST ne vaut pas « false »
const isTest = () => process.env.BILLING_TEST !== "false";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
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
  // Shopify affiche sa page de validation, puis remplace l'ancienne formule
  return billing.request({ plan: wanted, isTest: isTest() });
};

const PLANS = [
  { id: "free", name: "Gratuit", price: "0 $", features: [`${FREE_MONTHLY_LABELS} étiquettes par mois`, "Formats prêts", `${FREE_CUSTOM_TEMPLATES} modèle personnalisé`, "Codes-barres uniques"] },
  { id: PRO, name: PRO, price: `${PLAN_PRICES[PRO]} $ par mois`, features: ["Étiquettes illimitées", "Éditeur complet, modèles illimités", "Bons de commande, transferts, CSV"] },
  { id: MAGASIN, name: MAGASIN, price: `${PLAN_PRICES[MAGASIN]} $ par mois`, features: ["Tout Pro", "Plusieurs magasins et réception par scan", "Tuile en caisse", "Impression directe Zebra et Dymo", "Support prioritaire"] },
] as const;

const PLAN_ID = { free: "free", pro: PRO, store: MAGASIN } as const;

export default function Plans() {
  const { plan, used } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const busy = useNavigation().state !== "idle";
  return (
    <s-page heading="Formules">
      {result?.message && <s-banner tone="info">{result.message}</s-banner>}
      <s-section>
        <s-paragraph>
          Formule actuelle : {PLAN_NAMES[plan]}. {plan === "free" ? `${used} étiquettes sur ${FREE_MONTHLY_LABELS} utilisées ce mois-ci.` : `${used} étiquettes imprimées ce mois-ci.`}
        </s-paragraph>
      </s-section>
      {PLANS.map((p) => (
        <s-section key={p.id} heading={`${p.name} · ${p.price}`}>
          <s-unordered-list>
            {p.features.map((f) => (
              <s-list-item key={f}>{f}</s-list-item>
            ))}
          </s-unordered-list>
          {PLAN_ID[plan] === p.id ? (
            <s-badge tone="success">Formule actuelle</s-badge>
          ) : (
            <Form method="post">
              <input type="hidden" name="plan" value={p.id} />
              <s-button type="submit" variant={p.id === "free" ? "secondary" : "primary"} disabled={busy}>
                {p.id === "free" ? "Revenir au Gratuit" : `Choisir ${p.name}`}
              </s-button>
            </Form>
          )}
        </s-section>
      ))}
    </s-page>
  );
}
