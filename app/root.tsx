import { Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { langFromRequest } from "./lib/i18n";

export const loader = ({ request }: LoaderFunctionArgs) => ({ lang: langFromRequest(request) });

export default function App() {
  const { lang } = useLoaderData<typeof loader>();
  return (
    <html lang={lang}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
