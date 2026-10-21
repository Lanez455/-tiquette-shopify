import { EN } from "./en";

// L'app est écrite en français ; l'anglais est servi à tout marchand dont
// l'admin Shopify n'est pas en français. Les textes français servent de clés :
// « {n} étiquettes » se traduit par l'entrée EN["{n} étiquettes"].
export type Lang = "fr" | "en";
export type Vars = Record<string, string | number>;

export function pickLang(locale: string | null | undefined): Lang | null {
  if (!locale) return null;
  return locale.trim().toLowerCase().startsWith("fr") ? "fr" : "en";
}

// Langue de l'admin (paramètre `locale` ajouté par Shopify), sinon celle du navigateur
export function langFromRequest(request: Request): Lang {
  const fromAdmin = pickLang(new URL(request.url).searchParams.get("locale"));
  if (fromAdmin) return fromAdmin;
  const accept = request.headers.get("Accept-Language")?.split(",")[0];
  return pickLang(accept) ?? "en";
}

const fill = (text: string, vars?: Vars) =>
  vars ? text.replace(/\{(\w+)\}/g, (all, name: string) => (name in vars ? String(vars[name]) : all)) : text;

// Messages composés ailleurs (erreurs du serveur, noms de formats) : on retrouve
// le modèle français qui a servi à les écrire, et ses valeurs
const PLACEHOLDER = /\{(\w+)\}/g;
const escape = (s: string) => s.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
const patterns = Object.entries(EN)
  .filter(([fr]) => /\{\w+\}/.test(fr))
  .map(([fr, en]) => {
    const names: string[] = [];
    const source = fr
      .split(PLACEHOLDER)
      .map((part, i) => (i % 2 ? (names.push(part), "(.+?)") : escape(part)))
      .join("");
    return { regex: new RegExp(`^${source}$`, "s"), names, en, literal: fr.replace(PLACEHOLDER, "").length };
  })
  // Les modèles les plus précis d'abord : « {n} codes » ne doit pas tout attraper
  .sort((a, b) => b.literal - a.literal);

function translateEn(text: string, depth: number): string {
  const exact = EN[text];
  if (exact !== undefined) return exact;
  if (depth > 2) return text;
  for (const { regex, names, en } of patterns) {
    const match = regex.exec(text);
    if (!match) continue;
    const vars: Vars = {};
    names.forEach((name, i) => (vars[name] = translateEn(match[i + 1]!, depth + 1)));
    return fill(en, vars);
  }
  return text;
}

export function translate(lang: Lang, text: string, vars?: Vars): string {
  if (lang === "fr") return fill(text, vars);
  const en = EN[text];
  if (en !== undefined) return fill(en, vars);
  return translateEn(fill(text, vars), 0);
}

export const dateLocale = (lang: Lang) => (lang === "fr" ? "fr-FR" : "en-US");
