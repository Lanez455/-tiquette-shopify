// Texte qui rétrécit pour tenir dans sa zone (F7), au lieu d'être coupé par « … ».

export type MeasureWidth = (text: string, fontSize: number) => number;

export interface FitOptions {
  maxWidth: number;
  maxHeight: number;
  maxFontSize: number;
  minFontSize: number;
  lineHeight?: number;
  maxLines?: number;
}

export interface FitResult {
  fontSize: number;
  lines: string[];
  // Vrai seulement si même la taille minimale ne suffit pas : l'aperçu l'affiche
  overflow: boolean;
}

function wrap(text: string, size: number, maxWidth: number, measure: MeasureWidth): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    // Mot plus large que la zone : coupé caractère par caractère
    current = "";
    for (const char of word) {
      if (current && measure(current + char, size) > maxWidth) {
        lines.push(current);
        current = char;
      } else {
        current += char;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function fitText(text: string, measure: MeasureWidth, options: FitOptions): FitResult {
  const lineHeight = options.lineHeight ?? 1.15;
  const step = 0.25;
  for (let size = options.maxFontSize; size >= options.minFontSize - 1e-9; size -= step) {
    const lines = wrap(text, size, options.maxWidth, measure);
    const fitsLines = options.maxLines === undefined || lines.length <= options.maxLines;
    if (fitsLines && lines.length * size * lineHeight <= options.maxHeight) {
      return { fontSize: size, lines, overflow: false };
    }
  }
  const size = options.minFontSize;
  const room = Math.max(1, Math.floor(options.maxHeight / (size * lineHeight)));
  const lines = wrap(text, size, options.maxWidth, measure).slice(0, Math.min(room, options.maxLines ?? room));
  return { fontSize: size, lines, overflow: true };
}
