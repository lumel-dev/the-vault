"use client";

import { createContext, useContext } from "react";
import { DEFAULT_LOCALE, messages, type Locale, type Messages } from "./index";

const I18nContext = createContext<Locale>(DEFAULT_LOCALE);

/**
 * El idioma baja por contexto y cada componente toma el diccionario de acá. El diccionario no se
 * pasa como prop desde el server porque tiene funciones (los textos con datos).
 */
export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <I18nContext.Provider value={locale}>{children}</I18nContext.Provider>;
}

export function useI18n(): { locale: Locale; t: Messages } {
  const locale = useContext(I18nContext);
  return { locale, t: messages[locale] };
}
