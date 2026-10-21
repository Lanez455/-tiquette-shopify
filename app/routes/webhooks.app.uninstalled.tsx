import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session } = await authenticate.webhook(request);
  // Le webhook peut arriver plusieurs fois : ne rien supposer
  if (session) await prisma.session.deleteMany({ where: { shop } });
  return new Response();
};
