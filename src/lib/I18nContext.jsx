import { createContext, useContext } from "react";
import { createTranslator, languageOptions } from "./i18n.js";

const defaultTranslator = createTranslator("zh");
export const I18nContext = createContext({ language: "zh", t: defaultTranslator });

export function useI18n() {
  return useContext(I18nContext);
}

export { languageOptions };
