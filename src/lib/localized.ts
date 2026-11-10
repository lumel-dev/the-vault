/**
 * Lo que se muestra de un objeto en un idioma: título, sinopsis, género y tapa de ese idioma si el
 * catálogo los trajo, y si no lo que está en las columnas comunes. Puro: lo usan la app y los tests.
 *
 * `aliases` son los títulos en los otros idiomas: la búsqueda los mira también, así "Tiempos
 * violentos" y "Pulp Fiction" encuentran lo mismo en cualquier idioma.
 */

import type { ItemTranslations } from "@/lib/db/schema";
import { LOCALES, type Locale } from "@/lib/i18n";

interface Localizable {
  name: string;
  description: string | null;
  attributes: Record<string, string>;
  coverSource: string | null;
  coverRef: string | null;
  translations: ItemTranslations;
}

export function localize<T extends Localizable>(item: T, locale: Locale): T & { aliases: string[] } {
  const tr = item.translations?.[locale];
  const attributes = tr?.genre ? { ...item.attributes, genre: tr.genre } : item.attributes;
  const aliases = LOCALES.filter((l) => l !== locale)
    .map((l) => item.translations?.[l]?.name)
    .filter((n): n is string => Boolean(n) && n !== (tr?.name ?? item.name));
  return {
    ...item,
    name: tr?.name || item.name,
    description: tr?.description ?? item.description,
    attributes,
    // Sólo se reemplaza la tapa si es de la misma fuente (las traducciones vienen de TMDB).
    coverRef: tr?.coverRef && item.coverSource === "tmdb" ? tr.coverRef : item.coverRef,
    aliases,
  };
}
