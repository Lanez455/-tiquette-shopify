import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import { MAGASIN, MAGASIN_ANNUAL, PLAN_PRICES, PRO, PRO_ANNUAL, TRIAL_DAYS } from "./lib/billing/plans";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  // 2026-10 minimum : nécessaire pour lire les bons de commande (F14)
  apiVersion: ApiVersion.October26,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  // Formules payantes (le Gratuit n'a pas d'abonnement) ; l'essai restant est recalculé à chaque demande
  billing: {
    [PRO]: { trialDays: TRIAL_DAYS, lineItems: [{ amount: PLAN_PRICES[PRO], currencyCode: "USD", interval: BillingInterval.Every30Days }] },
    [MAGASIN]: { trialDays: TRIAL_DAYS, lineItems: [{ amount: PLAN_PRICES[MAGASIN], currencyCode: "USD", interval: BillingInterval.Every30Days }] },
    [PRO_ANNUAL]: { trialDays: TRIAL_DAYS, lineItems: [{ amount: PLAN_PRICES[PRO_ANNUAL], currencyCode: "USD", interval: BillingInterval.Annual }] },
    [MAGASIN_ANNUAL]: { trialDays: TRIAL_DAYS, lineItems: [{ amount: PLAN_PRICES[MAGASIN_ANNUAL], currencyCode: "USD", interval: BillingInterval.Annual }] },
  },
  future: { expiringOfflineAccessTokens: true },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.October26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
