import { describe, expect, it } from "vitest";
import { FakeShop } from "~/testing/fakeShop";
import { can, checkPrint, currentPlan, forgetPlan, monthStart, planFromSubscriptions, PlanLimitError, remainingLabels } from "./plans";

describe("formules Gratuit, Pro, Magasin", () => {
  it("lit la formule active", () => {
    expect(planFromSubscriptions([])).toBe("free");
    expect(planFromSubscriptions([{ name: "Pro", status: "ACTIVE" }])).toBe("pro");
    expect(planFromSubscriptions([{ name: "Magasin", status: "ACTIVE" }, { name: "Pro", status: "CANCELLED" }])).toBe("store");
    expect(planFromSubscriptions([{ name: "Magasin", status: "PENDING" }])).toBe("free");
  });

  it("Gratuit : 50 étiquettes par mois, pas une de plus", () => {
    expect(remainingLabels("free", 30)).toBe(20);
    expect(() => checkPrint("free", { source: "product", usedThisMonth: 30, labels: 20 })).not.toThrow();
    expect(() => checkPrint("free", { source: "product", usedThisMonth: 30, labels: 21 })).toThrow(/il en reste 20/);
    expect(() => checkPrint("pro", { source: "product", usedThisMonth: 10_000, labels: 5000 })).not.toThrow();
  });

  it("chaque fonction est dans la bonne formule", () => {
    const ok = (plan: "free" | "pro" | "store", source: string, output?: string) => {
      try { checkPrint(plan, { source, output, usedThisMonth: 0, labels: 1 }); return true; } catch (e) { if (e instanceof PlanLimitError) return false; throw e; }
    };
    expect([ok("free", "csv"), ok("pro", "csv"), ok("pro", "purchase_order"), ok("pro", "transfer")]).toEqual([false, true, true, true]);
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
    subs[0]!.name = "Magasin";
    expect(await currentPlan(shop.gql, "s", 30_000)).toBe("pro");
    expect(await currentPlan(shop.gql, "s", 61_000)).toBe("store");
  });
});
