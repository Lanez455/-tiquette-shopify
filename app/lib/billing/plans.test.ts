import { describe, expect, it } from "vitest";
import { FakeShop } from "~/testing/fakeShop";
import { annualDiscount, can, checkPrint, currentPlan, forgetPlan, monthStart, PLAN_PRICES, planFromSubscriptions, PlanLimitError, remainingLabels, trialDaysLeft } from "./plans";

describe("formules Gratuit, Pro, Magasin", () => {
  it("lit la formule active", () => {
    expect(planFromSubscriptions([])).toBe("free");
    expect(planFromSubscriptions([{ name: "Pro", status: "ACTIVE" }])).toBe("pro");
    expect(planFromSubscriptions([{ name: "Store", status: "ACTIVE" }, { name: "Pro", status: "CANCELLED" }])).toBe("store");
    // Abonnements créés avant le changement de nom
    expect(planFromSubscriptions([{ name: "Magasin", status: "ACTIVE" }])).toBe("store");
    expect(planFromSubscriptions([{ name: "Store", status: "PENDING" }])).toBe("free");
    expect(planFromSubscriptions([{ name: "Pro Yearly", status: "ACTIVE" }])).toBe("pro");
    expect(planFromSubscriptions([{ name: "Store Yearly", status: "ACTIVE" }])).toBe("store");
  });

  it("à l'année : au moins 17 % de moins que 12 mois", () => {
    expect(annualDiscount(PLAN_PRICES.Pro, PLAN_PRICES["Pro Yearly"])).toBe(18);
    expect(annualDiscount(PLAN_PRICES.Store, PLAN_PRICES["Store Yearly"])).toBe(17);
  });

  it("essai de 14 jours, une seule fois par boutique", () => {
    const day = 86_400_000;
    const t0 = Date.parse("2026-11-01T10:00:00Z");
    expect(trialDaysLeft([], t0)).toBe(14);
    // Une demande jamais acceptée ne consomme pas l'essai
    expect(trialDaysLeft([{ status: "DECLINED", createdAt: "2026-11-01T10:00:00Z" }, { status: "PENDING", createdAt: "2026-11-01T10:00:00Z" }], t0 + 30 * day)).toBe(14);
    expect(trialDaysLeft([{ status: "CANCELLED", createdAt: "2026-11-01T10:00:00Z" }], t0 + 5 * day)).toBe(9);
    expect(trialDaysLeft([{ status: "ACTIVE", createdAt: "2026-11-20T10:00:00Z" }, { status: "CANCELLED", createdAt: "2026-11-01T10:00:00Z" }], t0 + 20 * day)).toBe(0);
  });

  it("Gratuit : 250 étiquettes par mois, pas une de plus", () => {
    expect(remainingLabels("free", 30)).toBe(220);
    expect(() => checkPrint("free", { source: "product", usedThisMonth: 30, labels: 220 })).not.toThrow();
    expect(() => checkPrint("free", { source: "product", usedThisMonth: 30, labels: 221 })).toThrow(/il en reste 220/);
    expect(() => checkPrint("pro", { source: "product", usedThisMonth: 10_000, labels: 5000 })).not.toThrow();
  });

  it("chaque fonction est dans la bonne formule", () => {
    const ok = (plan: "free" | "pro" | "store", source: string, output?: string) => {
      try { checkPrint(plan, { source, output, usedThisMonth: 0, labels: 1 }); return true; } catch (e) { if (e instanceof PlanLimitError) return false; throw e; }
    };
    expect([ok("free", "csv"), ok("pro", "csv"), ok("pro", "purchase_order"), ok("pro", "transfer")]).toEqual([false, true, true, true]);
    // Bons de commande et transferts dans le Gratuit depuis la 1.1.0
    expect([ok("free", "purchase_order"), ok("free", "transfer")]).toEqual([true, true]);
    expect([ok("pro", "receiving"), ok("store", "receiving"), ok("pro", "pos"), ok("store", "pos")]).toEqual([false, true, false, true]);
    expect([ok("pro", "product", "zpl"), ok("store", "product", "dymo"), ok("free", "promo")]).toEqual([false, true, true]);
    expect(can("free", "unlimited_templates")).toBe(false);
  });

  it("début du mois en UTC", () => {
    expect(monthStart(new Date("2026-10-21T23:30:00Z")).toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("garde la formule une minute", async () => {
    const shop = new FakeShop();
    const subs = [{ name: "Pro", status: "ACTIVE" }];
    (shop as unknown as Record<string, unknown>).opActiveSubscriptions = () => ({ currentAppInstallation: { activeSubscriptions: subs } });
    forgetPlan("s");
    expect(await currentPlan(shop.gql, "s", 0)).toBe("pro");
    subs[0]!.name = "Store";
    expect(await currentPlan(shop.gql, "s", 30_000)).toBe("pro");
    expect(await currentPlan(shop.gql, "s", 61_000)).toBe("store");
  });
});
