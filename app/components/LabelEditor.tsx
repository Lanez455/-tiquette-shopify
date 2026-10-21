import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  addElement,
  FIELD_LABELS,
  moveElement,
  removeElement,
  resizeElement,
  SAMPLE,
  updateElement,
  type Bounds,
} from "../lib/labels/editorOps";
import type { FieldKey, LabelElement, LabelTemplateLayout } from "../lib/labels/template";

// Éditeur visuel par glisser-déposer (F5) : l'étiquette est dessinée à l'échelle,
// chaque élément se déplace à la souris et se redimensionne par son coin.

const PT_TO_MM = 25.4 / 72;

function sampleText(e: LabelElement): string {
  if (e.kind === "text") return e.text;
  if (e.kind === "barcode" || e.kind === "qr") return "";
  if (e.field.startsWith("metafield:")) return `[${e.field.split(".").slice(1).join(".")}]`;
  return SAMPLE[e.field] ?? "";
}

export function LabelEditor({
  bounds,
  layout,
  onChange,
}: {
  bounds: Bounds;
  layout: LabelTemplateLayout;
  onChange: (layout: LabelTemplateLayout) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [metafield, setMetafield] = useState("product.custom.");
  const drag = useRef<{ index: number; mode: "move" | "resize"; startX: number; startY: number; origin: LabelElement } | null>(null);
  // Pixels par mm : l'étiquette tient dans 560 px de large
  const scale = Math.min(560 / bounds.widthMm, 320 / bounds.heightMm);

  function onPointerDown(event: ReactPointerEvent, index: number, mode: "move" | "resize") {
    event.stopPropagation();
    (event.target as Element).setPointerCapture(event.pointerId);
    setSelected(index);
    drag.current = { index, mode, startX: event.clientX, startY: event.clientY, origin: layout.elements[index]! };
  }

  function onPointerMove(event: ReactPointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = (event.clientX - d.startX) / scale;
    const dy = (event.clientY - d.startY) / scale;
    // Repart de la position d'origine pour éviter l'accumulation des arrondis
    const base = { elements: layout.elements.map((e, i) => (i === d.index ? d.origin : e)) };
    onChange(
      d.mode === "move"
        ? moveElement(base, d.index, d.origin.xMm + dx, d.origin.yMm + dy, bounds)
        : resizeElement(base, d.index, d.origin.wMm + dx, d.origin.hMm + dy, bounds),
    );
  }

  const current = selected !== null ? layout.elements[selected] : undefined;
  const add = (what: Parameters<typeof addElement>[1]) => {
    const next = addElement(layout, what, bounds);
    onChange(next);
    setSelected(next.elements.length - 1);
  };

  return (
    <s-stack gap="base">
      <div
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
        onPointerDown={() => setSelected(null)}
        style={{
          position: "relative",
          width: bounds.widthMm * scale,
          height: bounds.heightMm * scale,
          background: "#fff",
          border: "1px solid #8a8a8a",
          borderRadius: 4,
          touchAction: "none",
          userSelect: "none",
        }}
      >
        {layout.elements.map((e, i) => {
          const graphic = e.kind === "barcode" || e.kind === "qr";
          const fontPx = graphic ? 0 : e.maxFontSize * PT_TO_MM * scale;
          return (
            <div
              key={i}
              onPointerDown={(ev) => onPointerDown(ev, i, "move")}
              style={{
                position: "absolute",
                left: e.xMm * scale,
                top: e.yMm * scale,
                width: e.wMm * scale,
                height: e.hMm * scale,
                outline: selected === i ? "2px solid #005bd3" : "1px dashed #c4c4c4",
                cursor: "move",
                overflow: "hidden",
                fontSize: fontPx,
                lineHeight: 1.15,
                fontWeight: !graphic && e.bold ? 700 : 400,
                textAlign: !graphic ? e.align ?? "left" : "center",
                textDecoration: e.kind === "field" && e.field === "compareAtPrice" ? "line-through" : "none",
                fontFamily: "DejaVu Sans, Verdana, sans-serif",
                background:
                  e.kind === "barcode"
                    ? "repeating-linear-gradient(90deg,#000 0 2px,#fff 2px 4px,#000 4px 5px,#fff 5px 8px)"
                    : e.kind === "qr"
                      ? "repeating-conic-gradient(#000 0 25%,#fff 0 50%) 0 0/6px 6px"
                      : "transparent",
              }}
            >
              {sampleText(e)}
              <span
                onPointerDown={(ev) => onPointerDown(ev, i, "resize")}
                style={{ position: "absolute", right: 0, bottom: 0, width: 10, height: 10, background: "#005bd3", cursor: "nwse-resize" }}
              />
            </div>
          );
        })}
      </div>

      <s-stack direction="inline" gap="small">
        <s-select label="Ajouter un champ" onChange={(e) => e.currentTarget.value && add({ kind: "field", field: e.currentTarget.value as FieldKey })}>
          <s-option value="">Choisir…</s-option>
          {Object.entries(FIELD_LABELS).map(([key, label]) => (
            <s-option key={key} value={key}>{label}</s-option>
          ))}
        </s-select>
        <s-button onClick={() => add({ kind: "barcode" })}>Code-barres</s-button>
        <s-button onClick={() => add({ kind: "qr" })}>QR code (fiche produit)</s-button>
        <s-button onClick={() => add({ kind: "text", text: "Texte" })}>Texte libre</s-button>
        <s-text-field label="Métachamp (product.ns.clé ou variant.ns.clé)" value={metafield} onChange={(e) => setMetafield(e.currentTarget.value)}></s-text-field>
        <s-button onClick={() => add({ kind: "field", field: `metafield:${metafield}` as FieldKey })}>Ajouter le métachamp</s-button>
      </s-stack>

      {current && selected !== null && (
        <s-box padding="base" border="base" borderRadius="base">
          <s-stack direction="inline" gap="base">
            {current.kind === "text" && (
              <s-text-field label="Texte" value={current.text} onChange={(e) => onChange(updateElement(layout, selected, { text: e.currentTarget.value }))}></s-text-field>
            )}
            {current.kind === "qr" ? (
              <s-text color="subdued">Le QR code ouvre la fiche du produit dans la boutique en ligne.</s-text>
            ) : current.kind !== "barcode" ? (
              <>
                <s-number-field label="Taille max (pt)" min={2} max={72} value={String(current.maxFontSize)} onChange={(e) => onChange(updateElement(layout, selected, { maxFontSize: Number(e.currentTarget.value) || current.maxFontSize }))}></s-number-field>
                <s-number-field label="Taille min (pt)" min={2} max={72} value={String(current.minFontSize)} onChange={(e) => onChange(updateElement(layout, selected, { minFontSize: Number(e.currentTarget.value) || current.minFontSize }))}></s-number-field>
                <s-number-field label="Lignes max" min={1} max={10} value={String(current.maxLines ?? 2)} onChange={(e) => onChange(updateElement(layout, selected, { maxLines: Number(e.currentTarget.value) || 1 }))}></s-number-field>
                <s-checkbox label="Gras" checked={current.bold} onChange={(e) => onChange(updateElement(layout, selected, { bold: e.currentTarget.checked }))}></s-checkbox>
                <s-select label="Alignement" value={current.align ?? "left"} onChange={(e) => onChange(updateElement(layout, selected, { align: e.currentTarget.value as "left" | "center" | "right" }))}>
                  <s-option value="left">Gauche</s-option>
                  <s-option value="center">Centre</s-option>
                  <s-option value="right">Droite</s-option>
                </s-select>
              </>
            ) : (
              <s-checkbox label="Afficher les chiffres" checked={current.showDigits} onChange={(e) => onChange(updateElement(layout, selected, { showDigits: e.currentTarget.checked }))}></s-checkbox>
            )}
            <s-button tone="critical" onClick={() => { onChange(removeElement(layout, selected)); setSelected(null); }}>Retirer</s-button>
          </s-stack>
        </s-box>
      )}
    </s-stack>
  );
}
