import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, session } = await authenticate.webhook(request);
  const current = (payload as { current?: string[] }).current;
  if (session && current) {
    await prisma.session.update({ where: { id: session.id }, data: { scope: current.toString() } });
  }
  return new Response();
};
