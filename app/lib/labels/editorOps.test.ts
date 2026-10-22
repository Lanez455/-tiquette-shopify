import { describe, expect, it } from "vitest";
import { addElement, moveElement, removeElement, resizeElement, updateElement } from "./editorOps";
import type { LabelTemplateLayout } from "./template";
import { validateLayout } from "./validateLayout";

const bounds = { widthMm: 50, heightMm: 25 };
const base: LabelTemplateLayout = {
  elements: [{ kind: "field", field: "price", xMm: 2, yMm: 2, wMm: 20, hMm: 6, maxFontSize: 10, minFontSize: 5 }],
};

describe("éditeur visuel (F5)", () => {
  it("déplace le prix en bas à droite et le met en gras", () => {
    let layout = moveElement(base, 0, 100, 100, bounds);
    layout = updateElement(layout, 0, { bold: true });
    expect(layout.elements[0]).toMatchObject({ xMm: 30, yMm: 19, bold: true });
  });

  it("aligne sur une grille de 0,5 mm et ne sort jamais de l'étiquette", () => {
    expect(moveElement(base, 0, 3.26, -4, bounds).elements[0]).toMatchObject({ xMm: 3.5, yMm: 0 });
    const big = resizeElement(base, 0, 500, 0.1, bounds).elements[0]!;
    expect(big.wMm).toBe(48);
    expect(big.hMm).toBe(2);
  });

  it("ajoute et retire des éléments, et le résultat reste un modèle valide", () => {
    let layout = addElement(base, { kind: "barcode" }, bounds);
    layout = addElement(layout, { kind: "field", field: "metafield:product.custom.matiere" }, bounds);
    layout = addElement(layout, { kind: "text", text: "Fabriqué en France" }, bounds);
    expect(layout.elements).toHaveLength(4);
    expect(() => validateLayout(layout, bounds.widthMm, bounds.heightMm)).not.toThrow();
    expect(removeElement(layout, 0).elements).toHaveLength(3);
  });

  it("ne touche pas aux autres éléments", () => {
    const two = addElement(base, { kind: "barcode" }, bounds);
    const moved = moveElement(two, 1, 0, 0, bounds);
    expect(moved.elements[0]).toBe(two.elements[0]);
  });
});
