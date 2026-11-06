import type { Gql } from "../shopify/graphql";

// Formules : Gratuit, Pro 7,99 $, Magasin (« Store » chez Shopify) 17,99 $ par mois, ou à l'année (1.1.0)
export const PRO = "Pro" as const;
// Nom de l'abonnement chez Shopify, affiché sur sa page de paiement : identique
// au nom de la fiche App Store. Les abonnements créés avant s'appelaient « Magasin ».
export const MAGASIN = "Store" as const;
const MAGASIN_LEGACY = "Magasin";
export const PRO_ANNUAL = "Pro Yearly" as const;
export const MAGASIN_ANNUAL = "Store Yearly" as const;
export const PAID_PLANS = [PRO, MAGASIN, PRO_ANNUAL, MAGASIN_ANNUAL] as const;
export type PaidPlan = (typeof PAID_PLANS)[number];
export const isPaidPlan = (name: string): name is PaidPlan => (PAID_PLANS as readonly string[]).includes(name);
export type Plan = "free" | "pro" | "store";

// 50 jusqu'à la 1.0.0, 250 depuis la 1.1.0 (docs/ETUDE_CONCURRENCE.md)
export const FREE_MONTHLY_LABELS = 250;
export const FREE_CUSTOM_TEMPLATES = 1;

// Prix des nouveaux abonnements ; un abonnement existant garde son prix chez Shopify
export const PLAN_PRICES = { [PRO]: 7.99, [MAGASIN]: 17.99, [PRO_ANNUAL]: 79, [MAGASIN_ANNUAL]: 179 } as const;

// Remise de l'année par rapport à 12 mois, en %
export const annualDiscount = (monthly: number, yearly: number) => Math.round((1 - yearly / (12 * monthly)) * 100);

// Essai gratuit des formules payantes, une seule fois par boutique
export const TRIAL_DAYS = 14;

export type Feature =
  | "unlimited_labels"
  | "unlimited_templates"
  | "purchase_orders"
  | "csv"
  | "direct_print"
  | "receiving"
  | "pos";

const PLAN_FEATURES: Record<Plan, Feature[]> = {
  // Bons de commande et transferts inclus dans le Gratuit depuis la 1.1.0
  free: ["purchase_orders"],
  pro: ["unlimited_labels", "unlimited_templates", "purchase_orders", "csv"],
  store: ["unlimited_labels", "unlimited_templates", "purchase_orders", "csv", "direct_print", "receiving", "pos"],
};

export const can = (plan: Plan, feature: Feature) => PLAN_FEATURES[plan].includes(feature);

export const PLAN_NAMES: Record<Plan, string> = { free: "Gratuit", pro: PRO, store: "Magasin" };

const UPGRADE: Record<Feature, string> = {
  unlimited_labels: `La formule Gratuit compte ${FREE_MONTHLY_LABELS} étiquettes par mois`,
  unlimited_templates: `La formule Gratuit compte ${FREE_CUSTOM_TEMPLATES} modèle personnalisé`,
  purchase_orders: "L'impression depuis un bon de commande ou un transfert fait partie de la formule Pro",
  csv: "L'import CSV fait partie de la formule Pro",
  direct_print: "L'impression directe Zebra et Dymo fait partie de la formule Magasin",
  receiving: "La réception par scan fait partie de la formule Magasin",
  pos: "Les étiquettes depuis la caisse font partie de la formule Magasin",
};

export class PlanLimitError extends Error {
  constructor(public readonly feature: Feature, detail = "") {
    super(`${UPGRADE[feature]}${detail}. Changez de formule dans l'onglet Formules.`);
  }
}

export function requireFeature(plan: Plan, feature: Feature) {
  if (!can(plan, feature)) throw new PlanLimitError(feature);
}

// Étiquettes restantes ce mois-ci (Infinity hors formule Gratuit)
export function remainingLabels(plan: Plan, usedThisMonth: number): number {
  return can(plan, "unlimited_labels") ? Infinity : Math.max(0, FREE_MONTHLY_LABELS - usedThisMonth);
}

export function checkLabelQuota(plan: Plan, usedThisMonth: number, wanted: number) {
  const left = remainingLabels(plan, usedThisMonth);
  if (wanted > left) throw new PlanLimitError("unlimited_labels", ` : il en reste ${left} ce mois-ci, ${wanted} demandées`);
}

// Ce que demande une impression, selon d'où elle vient
export function checkPrint(plan: Plan, args: { source: string; output?: string; usedThisMonth: number; labels: number }) {
  if (args.source === "purchase_order" || args.source === "transfer") requireFeature(plan, "purchase_orders");
  if (args.source === "csv") requireFeature(plan, "csv");
  if (args.source === "receiving") requireFeature(plan, "receiving");
  if (args.source === "pos") requireFeature(plan, "pos");
  if (args.output === "zpl" || args.output === "dymo") requireFeature(plan, "direct_print");
  checkLabelQuota(plan, args.usedThisMonth, args.labels);
}

export const monthStart = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

export function planFromSubscriptions(subscriptions: { name: string; status: string }[]): Plan {
  const active = subscriptions.filter((s) => s.status === "ACTIVE").map((s) => s.name);
  if (active.includes(MAGASIN) || active.includes(MAGASIN_LEGACY) || active.includes(MAGASIN_ANNUAL)) return "store";
  if (active.includes(PRO) || active.includes(PRO_ANNUAL)) return "pro";
  return "free";
}

// Jours d'essai restants : l'essai court depuis le premier abonnement accepté,
// même résilié depuis, pour qu'on ne puisse pas l'enchaîner
const STARTED = new Set(["ACTIVE", "CANCELLED", "EXPIRED", "FROZEN"]);

export function trialDaysLeft(subscriptions: { status: string; createdAt: string }[], now = Date.now()): number {
  const starts = subscriptions.filter((s) => STARTED.has(s.status)).map((s) => Date.parse(s.createdAt));
  if (!starts.length) return TRIAL_DAYS;
  const used = Math.floor((now - Math.min(...starts)) / 86_400_000);
  return Math.max(0, TRIAL_DAYS - used);
}

export const ALL_SUBSCRIPTIONS = `#graphql
  query AllSubscriptions {
    currentAppInstallation { allSubscriptions(first: 50) { nodes { status createdAt } } }
  }`;

const ACTIVE_SUBSCRIPTIONS = `#graphql
  query ActiveSubscriptions {
    currentAppInstallation { activeSubscriptions { name status } }
  }`;

// Lu sur Shopify et gardé une minute : marche aussi hors de l'admin (caisse, liens)
const cache = new Map<string, { plan: Plan; at: number }>();

export async function currentPlan(gql: Gql, shop: string, now = Date.now()): Promise<Plan> {
  const hit = cache.get(shop);
  if (hit && now - hit.at < 60_000) return hit.plan;
  const data = await gql<{ currentAppInstallation: { activeSubscriptions: { name: string; status: string }[] } }>(ACTIVE_SUBSCRIPTIONS);
  const plan = planFromSubscriptions(data.currentAppInstallation.activeSubscriptions);
  cache.set(shop, { plan, at: now });
  return plan;
}

export const forgetPlan = (shop: string) => cache.delete(shop);
