import { describe, expect, it, vi } from "vitest";
import { askReview, shouldAskReview } from "./ask";

describe("demande d'avis", () => {
  it("demande à la 3e, 20e et 50e impression, pas avant ni entre", () => {
    expect([0, 1, 2].map((n) => shouldAskReview(n, n + 1))).toEqual([false, false, true]);
    expect([3, 10, 18].map((n) => shouldAskReview(n, n + 1))).toEqual([false, false, false]);
    expect([shouldAskReview(19, 20), shouldAskReview(49, 50), shouldAskReview(50, 51)]).toEqual([true, true, false]);
  });

  it("ne bloque jamais l'impression", async () => {
    expect(await askReview(undefined)).toBeNull();
    expect(await askReview({ request: vi.fn().mockRejectedValue(new Error("hors admin")) })).toBeNull();
    expect(await askReview({ request: vi.fn().mockResolvedValue({ success: false, code: "already-reviewed" }) })).toEqual({ success: false, code: "already-reviewed" });
  });
});
