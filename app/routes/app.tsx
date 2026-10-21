import type { HeadersArgs, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import { langFromRequest } from "../lib/i18n";
import { I18nProvider, useT } from "../lib/i18n/react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "", lang: langFromRequest(request) };
};

export default function App() {
  const data = useLoaderData<typeof loader>();
  // Langue fixée au chargement : Shopify ne l'indique que dans la première adresse
  const [lang] = useState(data.lang);
  return (
    <AppProvider apiKey={data.apiKey}>
      <I18nProvider lang={lang}>
        <Nav />
        <Outlet />
      </I18nProvider>
    </AppProvider>
  );
}

function Nav() {
  const t = useT();
  return (
    <s-app-nav>
      <s-link href="/app">{t("Accueil")}</s-link>
      <s-link href="/app/print">{t("Impression")}</s-link>
      <s-link href="/app/receive">{t("Réception")}</s-link>
      <s-link href="/app/promos">{t("Prix changés")}</s-link>
      <s-link href="/app/templates">{t("Modèles")}</s-link>
      <s-link href="/app/barcodes">{t("Codes-barres")}</s-link>
      <s-link href="/app/plans">{t("Formules")}</s-link>
      <s-link href="/app/settings">{t("Réglages")}</s-link>
      <s-link href="/app/help">{t("Aide")}</s-link>
    </s-app-nav>
  );
}

// Nécessaire pour que les redirections d'authentification fonctionnent dans l'iframe
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs: HeadersArgs) => boundary.headers(headersArgs);
