import en from "./en";
import es, { type Messages } from "./es";

export type { Messages };

/** Los idiomas de la app. El primero es el de siempre (y el de los datos guardados sin idioma). */
export const LOCALES = ["es", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "es";

export const messages: Record<Locale, Messages> = { es, en };

export function isLocale(value: unknown): value is Locale {
  return value === "es" || value === "en";
}

/** El idioma con que se le pide cada cosa a TMDB: castellano latinoamericano e inglés de EE. UU. */
export const TMDB_LANGUAGE: Record<Locale, string> = { es: "es-MX", en: "en-US" };

/** Para quien todavía no entró: el idioma del navegador si es inglés, si no castellano. */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  const first = (header ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  return first.startsWith("en") ? "en" : DEFAULT_LOCALE;
}
