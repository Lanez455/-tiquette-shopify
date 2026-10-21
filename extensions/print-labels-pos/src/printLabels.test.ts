import { describe, expect, it } from "vitest";
import { parseLinesParam } from "../../../app/lib/print/links.server";
import { labelsPath } from "./printLabels";

describe("adresse d'impression de la caisse", () => {
  it("le serveur relit exactement ce que la caisse envoie", () => {
    const path = labelsPath([{ variantId: 4211, quantity: 2 }, { variantId: 99, quantity: 0 }, { variantId: 7, quantity: 5000 }]);
    expect(path.startsWith("/print/pos?l=")).toBe(true);
    const l = new URL(path, "https://app.example").searchParams.get("l");
    expect(parseLinesParam(l)).toEqual([
      { variantId: "gid://shopify/ProductVariant/4211", quantity: 2 },
      { variantId: "gid://shopify/ProductVariant/7", quantity: 1000 },
    ]);
  });

  it("transmet la langue de la caisse, pour des messages d'erreur dans la même langue", () => {
    const path = labelsPath([{ variantId: 1, quantity: 1 }], "en");
    expect(new URL(path, "https://app.example").searchParams.get("locale")).toBe("en");
  });
});
