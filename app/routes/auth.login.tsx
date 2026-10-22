import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { login } from "../shopify.server";
import { langFromRequest } from "../lib/i18n";
import { I18nProvider, useT } from "../lib/i18n/react";

// Règle de l'App Store : ne jamais demander au marchand de saisir l'adresse de
// sa boutique. Avec ?shop=…, login() redirige vers l'installation gérée par
// Shopify ; sinon, on explique où ouvrir l'app.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (new URL(request.url).searchParams.get("shop")) await login(request);
  return { lang: langFromRequest(request) };
};

export default function Login() {
  const { lang } = useLoaderData<typeof loader>();
  return (
    <I18nProvider lang={lang}>
      <OpenFromAdmin />
    </I18nProvider>
  );
}

function OpenFromAdmin() {
  const t = useT();
  return (
    <AppProvider apiKey="">
      <s-page heading="Etiqo Barcode Labels">
        <s-section heading={t("Ouvrez Etiqo depuis votre administration Shopify")}>
          <s-paragraph>
            {t("Dans l'administration de votre boutique, allez dans Applications, puis choisissez Etiqo Barcode Labels.")}
          </s-paragraph>
          <s-paragraph>
            {t("Pas encore installée ? Ajoutez-la depuis l'App Store de Shopify.")}{" "}
            <s-link href="https://apps.shopify.com" target="_blank">apps.shopify.com</s-link>
          </s-paragraph>
          <s-paragraph>
            <s-link href="/confidentialite">{t("Politique de confidentialité")}</s-link>
          </s-paragraph>
        </s-section>
      </s-page>
    </AppProvider>
  );
}
