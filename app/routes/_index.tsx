import { redirect, type LoaderFunctionArgs } from "react-router";

// L'app est toujours ouverte depuis l'administration Shopify
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }
  throw redirect("/auth/login");
};
