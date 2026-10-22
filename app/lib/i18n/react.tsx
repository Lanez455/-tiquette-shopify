import { createContext, useCallback, useContext, type ReactNode } from "react";
import { translate, type Lang, type Vars } from "./index";

const LangContext = createContext<Lang>("fr");

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);

// t("{n} étiquettes", { n: 3 }) → « 3 étiquettes » ou « 3 labels »
export function useT() {
  const lang = useLang();
  return useCallback((text: string | null | undefined, vars?: Vars) => (text ? translate(lang, text, vars) : ""), [lang]);
}
