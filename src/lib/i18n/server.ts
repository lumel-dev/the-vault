import "server-only";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { DEFAULT_LOCALE, isLocale, localeFromAcceptLanguage, messages, type Locale } from "./index";

/** El idioma guardado del usuario. */
export async function getUserLocale(userId: string): Promise<Locale> {
  const [row] = await db.select({ locale: users.locale }).from(users).where(eq(users.id, userId)).limit(1);
  return isLocale(row?.locale) ? row.locale : DEFAULT_LOCALE;
}

/**
 * El idioma de esta request: el del usuario logueado y, antes de entrar, el del navegador. Se lee
 * de la base y no del JWT para que cambiarlo se vea en el acto, sin volver a entrar.
 */
export async function getLocale(): Promise<Locale> {
  const session = await auth();
  if (session?.user?.id) return getUserLocale(session.user.id);
  return localeFromAcceptLanguage((await headers()).get("accept-language"));
}

export async function getMessages() {
  const locale = await getLocale();
  return { locale, t: messages[locale] };
}
