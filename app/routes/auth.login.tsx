import { useState } from "react";
import { Form, useActionData, useLoaderData, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { LoginErrorType } from "@shopify/shopify-app-react-router/server";
import { login } from "../shopify.server";
import { langFromRequest } from "../lib/i18n";
import { I18nProvider, useT } from "../lib/i18n/react";

function errorMessage(errors: Awaited<ReturnType<typeof login>> | undefined) {
  if (!errors || errors instanceof Response) return undefined;
  if (errors.shop === LoginErrorType.MissingShop) return "Indiquez l'adresse de la boutique.";
  if (errors.shop === LoginErrorType.InvalidShop) return "Adresse de boutique invalide.";
  return undefined;
}

export const loader = async ({ request }: LoaderFunctionArgs) => ({ error: errorMessage(await login(request)), lang: langFromRequest(request) });
export const action = async ({ request }: ActionFunctionArgs) => ({ error: errorMessage(await login(request)) });

export default function Login() {
  const { lang } = useLoaderData<typeof loader>();
  return (
    <I18nProvider lang={lang}>
      <LoginForm />
    </I18nProvider>
  );
}

function LoginForm() {
  const t = useT();
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [shop, setShop] = useState("");
  const error = actionData?.error ?? loaderData.error;

  return (
    <AppProvider apiKey="">
      <s-page>
        <Form method="post">
          <s-section heading={t("Connexion")}>
            <s-text-field
              name="shop"
              label={t("Adresse de la boutique")}
              details={t("exemple.myshopify.com")}
              value={shop}
              onChange={(e) => setShop(e.currentTarget.value)}
              autocomplete="on"
              error={t(error)}
            ></s-text-field>
            <s-button type="submit">{t("Se connecter")}</s-button>
          </s-section>
        </Form>
      </s-page>
    </AppProvider>
  );
}
