import { describe, expect, it } from "vitest";
import { createPrintLink, InvalidLinkError, LINK_TTL_MS, verifyPrintLink } from "./signedLink";

const payload = { shop: "demo.myshopify.com", jobId: "job1" };

describe("liens d'impression signés", () => {
  it("se vérifient avec le bon secret", () => {
    const link = createPrintLink(payload, "secret", 1000);
    expect(verifyPrintLink(new URLSearchParams(link), "secret", 2000)).toMatchObject(payload);
  });

  it("refusent un autre secret, une donnée modifiée ou une signature absente", () => {
    const link = new URLSearchParams(createPrintLink(payload, "secret", 1000));
    expect(() => verifyPrintLink(link, "autre", 2000)).toThrow(InvalidLinkError);
    const forged = new URLSearchParams(link);
    forged.set("d", Buffer.from(JSON.stringify({ ...payload, shop: "autre.myshopify.com", exp: 9e15 })).toString("base64url"));
    expect(() => verifyPrintLink(forged, "secret", 2000)).toThrow(InvalidLinkError);
    expect(() => verifyPrintLink(new URLSearchParams("d=abc"), "secret", 2000)).toThrow(InvalidLinkError);
  });

  it("expirent", () => {
    const link = new URLSearchParams(createPrintLink(payload, "secret", 1000));
    expect(() => verifyPrintLink(link, "secret", 1000 + LINK_TTL_MS + 1)).toThrow(/expiré/);
  });

  it("restent courts", () => {
    expect(createPrintLink(payload, "secret").length).toBeLessThan(200);
  });

  it("refusent un secret vide", () => {
    expect(() => createPrintLink(payload, "")).toThrow();
  });
});
