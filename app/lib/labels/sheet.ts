import type { LabelFormat } from "./formats";

export interface LabelSlot {
  page: number;
  // Coin haut-gauche de l'étiquette, en mm depuis le haut-gauche de la page
  xMm: number;
  yMm: number;
}

export interface StartCell {
  // Numérotés à partir de 1, comme sur la planche
  row: number;
  column: number;
}

// Place `count` étiquettes. Sur une planche entamée, on commence à la case
// choisie (F3) ; sur un rouleau, une étiquette = une page.
export function layoutSlots(format: LabelFormat, count: number, start: StartCell = { row: 1, column: 1 }): LabelSlot[] {
  if (format.kind === "roll") {
    return Array.from({ length: count }, (_, i) => ({ page: i, xMm: 0, yMm: 0 }));
  }
  if (start.row < 1 || start.row > format.rows || start.column < 1 || start.column > format.columns) {
    throw new Error(`Case de départ hors planche (${format.rows} lignes × ${format.columns} colonnes)`);
  }
  const perPage = format.rows * format.columns;
  const first = (start.row - 1) * format.columns + (start.column - 1);
  return Array.from({ length: count }, (_, i) => {
    const index = first + i;
    const cell = index % perPage;
    return {
      page: Math.floor(index / perPage),
      xMm: format.marginLeftMm + (cell % format.columns) * format.pitchXMm,
      yMm: format.marginTopMm + Math.floor(cell / format.columns) * format.pitchYMm,
    };
  });
}
