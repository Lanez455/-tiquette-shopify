import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { EN } from "./en";
import { langFromRequest, pickLang, translate } from "./index";
import { PlanLimitError } from "../billing/plans";

const ROOT = join(__dirname, "../../..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "i18n" || name === "testing" ? [] : files(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

// Textes visibles par le marchand : du français, pas du code ni du GraphQL
const FRENCH = /[àâçéèêëîïôûùœÉÈÀ«»]|\b(le|la|les|des|du|un|une|aucun|aucune|pour|sur|dans|avec|est|sont|ou|et)\b/i;
const NOT_TEXT = /^\s*(#graphql|query |mutation |fragment )|gid:\/\/|^[\w.:/-]+$|^\{"/;
// Données, pas des phrases : alias de colonnes CSV, noms d'exemple
const IGNORED = new Set(["code-barres", "code barres", "code-barre", "code barre", "référence", "id variante", "Boucles d'oreilles créoles argent 925", "Boucles d'oreilles créoles argent 925 · Argent", "Argent", "Atelier Lune", "Bijoux", "29,90 €", "39,90 €", "fr-FR", "Expédition"]);

function frenchTexts(path: string): { found: string[]; keys: string[] } {
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: string[] = [];
  const keys: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    let text: string | null = null;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      // Clés d'objet (alias CSV, motifs) : ce ne sont pas des phrases affichées
      if (ts.isPropertyAssignment(node.parent) && node.parent.name === node) return;
      text = node.text;
    } else if (ts.isTemplateExpression(node)) {
      text = node.head.text + node.templateSpans.map((s) => `7${s.literal.text}`).join("");
    } else if (ts.isJsxText(node)) {
      text = node.text.replace(/\s+/g, " ").trim();
    }
    // Premier argument de t(), tr() ou translate() : toujours un texte à traduire
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(source);
      const arg = callee === "translate" ? node.arguments[1] : callee === "t" || callee === "tr" ? node.arguments[0] : undefined;
      if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) keys.push(arg.text);
    }
    if (text !== null && FRENCH.test(text) && !NOT_TEXT.test(text) && !IGNORED.has(text) && /[a-zà-ÿ]{2,}/i.test(text)) found.push(text);
    if (!ts.isTemplateExpression(node)) ts.forEachChild(node, visit);
    else node.templateSpans.forEach((s) => ts.forEachChild(s.expression, visit));
  };
  visit(source);
  return { found, keys };
}

const SOURCES = [...files(join(ROOT, "app/routes")), ...files(join(ROOT, "app/components")), ...files(join(ROOT, "app/lib"))]
  .filter((p) => !p.endsWith("confidentialite.tsx")); // page déjà rédigée dans les deux langues

describe("version anglaise", () => {
  it("chaque texte français visible a sa traduction anglaise", () => {
    const missing = new Set<string>();
    for (const path of SOURCES) {
      const { found, keys } = frenchTexts(path);
      for (const text of found) {
        if (translate("en", text) === text) missing.add(`${path.slice(ROOT.length + 1)} : ${text}`);
      }
      for (const key of keys) {
        if (!(key in EN)) missing.add(`${path.slice(ROOT.length + 1)} : ${key}`);
      }
    }
    if (process.env.I18N_DUMP) writeFileSync(process.env.I18N_DUMP, [...missing].join("\n"));
    expect([...missing]).toEqual([]);
  });

  it("les traductions gardent les mêmes valeurs à insérer", () => {
    const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const wrong = Object.entries(EN).filter(([fr, en]) => names(fr).join() !== names(en).join());
    expect(wrong).toEqual([]);
  });

  it("traduit les messages composés ailleurs, valeurs comprises", () => {
    expect(translate("en", "{n} étiquettes", { n: 3 })).toBe("3 labels");
    expect(translate("en", "Confirmation requise : tapez « REMPLACER 4 »")).toBe("Confirmation required: type “REPLACE 4”");
    expect(translate("fr", "{n} étiquettes", { n: 3 })).toBe("3 étiquettes");
    expect(translate("en", new PlanLimitError("unlimited_labels", " : il en reste 47 ce mois-ci, 60 demandées").message)).toBe(
      "The Free plan includes 50 labels per month: 47 left this month, 60 requested. Change plans in the Plans tab.",
    );
    expect(translate("en", new PlanLimitError("pos").message)).toBe("Labels from POS are part of the Store plan. Change plans in the Plans tab.");
    expect(translate("en", "#1002 : 12 articles ajoutés, 2 article(s) supprimé(s) ignoré(s).")).toBe("#1002: 12 items added, 2 deleted item(s) skipped.");
    expect(translate("en", "Élément 3 : dépasse de l'étiquette")).toBe("Element 3: goes past the label edge");
    expect(translate("en", "Remplacer tous les codes")).toBe("Replace all barcodes");
    // Un texte inconnu reste tel quel plutôt que de disparaître
    expect(translate("en", "Bague Lune")).toBe("Bague Lune");
  });

  it("choisit la langue de l'admin, puis celle du navigateur", () => {
    expect(pickLang("fr-CA")).toBe("fr");
    expect(pickLang("de")).toBe("en");
    expect(langFromRequest(new Request("https://app.test/app?locale=en", { headers: { "Accept-Language": "fr-FR" } }))).toBe("en");
    expect(langFromRequest(new Request("https://app.test/app", { headers: { "Accept-Language": "fr-FR,fr;q=0.9" } }))).toBe("fr");
    expect(langFromRequest(new Request("https://app.test/app"))).toBe("en");
  });

  it("les extensions ont les mêmes clés en français et en anglais", () => {
    for (const ext of ["print-labels-admin", "print-labels-pos"]) {
      const fr = JSON.parse(readFileSync(join(ROOT, `extensions/${ext}/locales/fr.json`), "utf8"));
      const en = JSON.parse(readFileSync(join(ROOT, `extensions/${ext}/locales/en.default.json`), "utf8"));
      expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort());
    }
  });
});
