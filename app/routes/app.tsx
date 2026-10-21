import type { HeadersArgs, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();
  return (
    <AppProvider apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Accueil</s-link>
        <s-link href="/app/print">Impression</s-link>
        <s-link href="/app/templates">Modèles</s-link>
        <s-link href="/app/barcodes">Codes-barres</s-link>
        <s-link href="/app/settings">Réglages</s-link>
        <s-link href="/app/help">Aide</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Nécessaire pour que les redirections d'authentification fonctionnent dans l'iframe
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs: HeadersArgs) => boundary.headers(headersArgs);
