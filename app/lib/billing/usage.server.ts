import prisma from "../../db.server";
import type { Gql } from "../shopify/graphql";
import { checkPrint, currentPlan, monthStart, type Plan } from "./plans";

export async function labelsUsedThisMonth(shop: string): Promise<number> {
  const result = await prisma.printJob.aggregate({ where: { shop, createdAt: { gte: monthStart() } }, _sum: { labelCount: true } });
  return result._sum.labelCount ?? 0;
}

// Vérifie la formule avant une impression ; lève PlanLimitError sinon
export async function enforcePrint(gql: Gql, shop: string, args: { source: string; output?: string; labels: number }): Promise<Plan> {
  const [plan, usedThisMonth] = await Promise.all([currentPlan(gql, shop), labelsUsedThisMonth(shop)]);
  checkPrint(plan, { ...args, usedThisMonth });
  return plan;
}
