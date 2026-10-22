import { describe, expect, it } from "vitest";
import { gqlFromAdmin, throttleDelayMs } from "./graphql";

// Forme de l'erreur levée par @shopify/shopify-api quand Shopify répond THROTTLED
function throttled(available: number, requested = 500) {
  return Object.assign(new Error("Throttled"), {
    body: {
      errors: { graphQLErrors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }] },
      extensions: { cost: { requestedQueryCost: requested, throttleStatus: { currentlyAvailable: available, restoreRate: 100 } } },
    },
  });
}

describe("appels à l'API Admin", () => {
  it("attend puis réessaie quand Shopify limite le débit", async () => {
    const waits: number[] = [];
    let calls = 0;
    const admin = {
      graphql: async () => {
        calls++;
        if (calls < 3) throw throttled(100);
        return new Response(JSON.stringify({ data: { ok: true } }));
      },
    };
    const gql = gqlFromAdmin(admin, async (ms) => waits.push(ms));
    await expect(gql("query X { shop { id } }")).resolves.toEqual({ ok: true });
    expect(calls).toBe(3);
    // 400 points manquants à 100 par seconde
    expect(waits).toEqual([4000, 4000]);
  });

  it("abandonne après 5 essais et ne réessaie pas les autres erreurs", async () => {
    let calls = 0;
    const gql = gqlFromAdmin({ graphql: async () => { calls++; throw throttled(0); } }, async () => {});
    await expect(gql("query X { shop { id } }")).rejects.toThrow("Throttled");
    expect(calls).toBe(5);

    calls = 0;
    const broken = gqlFromAdmin({ graphql: async () => { calls++; throw new Error("Field 'x' doesn't exist"); } }, async () => {});
    await expect(broken("query X { shop { id } }")).rejects.toThrow("doesn't exist");
    expect(calls).toBe(1);
  });

  it("borne l'attente entre une demi-seconde et 10 secondes", () => {
    expect(throttleDelayMs(throttled(990, 1000))).toBe(500);
    expect(throttleDelayMs(throttled(0, 50_000))).toBe(10_000);
    expect(throttleDelayMs(new Error("autre"))).toBeNull();
  });

  it("transmet les erreurs GraphQL renvoyées sans exception", async () => {
    const gql = gqlFromAdmin({ graphql: async () => new Response(JSON.stringify({ errors: [{ message: "Accès refusé" }] })) });
    await expect(gql("query X { shop { id } }")).rejects.toThrow("Accès refusé");
  });
});
