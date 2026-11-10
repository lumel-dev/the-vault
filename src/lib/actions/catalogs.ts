"use server";

import { z } from "zod";
import { requireUserId } from "@/lib/auth/session";
import { searchAlbums, searchBooks, type CatalogResult } from "@/lib/catalogs";
import { messages } from "@/lib/i18n";
import { getUserLocale } from "@/lib/i18n/server";
import type { ActionResult } from "./items";

// Libros y discos se buscan desde el server, igual que TMDB: un User-Agent propio para
// MusicBrainz y nada que dependa del browser.

export async function searchCatalogAction(catalog: "books" | "albums", query: string): Promise<ActionResult<CatalogResult[]>> {
  const t = messages[await getUserLocale(await requireUserId())];
  const kind = z.enum(["books", "albums"]).parse(catalog);
  const q = z.string().max(200).parse(query);
  try {
    return { ok: true, data: kind === "books" ? await searchBooks(q) : await searchAlbums(q) };
  } catch (error) {
    console.error("[catalog]", error);
    return { ok: false, error: kind === "books" ? t.errors.openlibrary : t.errors.musicbrainz };
  }
}
