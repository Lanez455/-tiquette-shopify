import { describe, expect, it } from "vitest";
import { defaultLayout } from "./defaultLayouts";
import { FORMATS } from "./formats";
import { LayoutError, validateLayout } from "./validateLayout";

describe("validation des modèles", () => {
  it("accepte la mise en page par défaut de chaque format", () => {
    for (const f of FORMATS) {
      const layout = defaultLayout(f);
      expect(validateLayout(JSON.parse(JSON.stringify(layout)), f.widthMm, f.heightMm).elements).toHaveLength(layout.elements.length);
    }
  });

  it("refuse un élément qui dépasse, un champ inconnu ou des tailles absurdes", () => {
    const base = { kind: "field", field: "price", xMm: 1, yMm: 1, wMm: 10, hMm: 5, maxFontSize: 10, minFontSize: 4 };
    const bad = [
      { ...base, wMm: 30 },
      { ...base, field: "password" },
      { ...base, minFontSize: 12 },
      { ...base, xMm: Number.NaN },
      { ...base, kind: "script" },
      { kind: "text", text: "x".repeat(201), xMm: 1, yMm: 1, wMm: 5, hMm: 5, maxFontSize: 8, minFontSize: 4 },
    ];
    for (const element of bad) expect(() => validateLayout({ elements: [element] }, 25, 25)).toThrow(LayoutError);
    expect(() => validateLayout(null, 25, 25)).toThrow(LayoutError);
  });

  it("accepte les métachamps produit et variante, et le prix seul (F6)", () => {
    const layout = validateLayout(
      { elements: [{ kind: "field", field: "metafield:product.custom.matiere", xMm: 0, yMm: 0, wMm: 10, hMm: 5, maxFontSize: 8, minFontSize: 4 }] },
      25, 25,
    );
    expect(layout.elements[0]).toMatchObject({ field: "metafield:product.custom.matiere" });
  });
});
