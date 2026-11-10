"use server";

import { eq } from "drizzle-orm";
import { AuthError } from "next-auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { signIn, signOut } from "@/lib/auth/auth";
import { hashPassword } from "@/lib/auth/password";
import { requireUserId } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { isLocale, messages } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

export type FormState = { error?: string } | undefined;

export async function signupEnabled(): Promise<boolean> {
  return process.env.SIGNUP_ENABLED === "true";
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/",
    });
  } catch (error) {
    // signIn redirige tirando una excepción: sólo se atrapan los errores de credenciales.
    if (error instanceof AuthError) return { error: messages[await getLocale()].errors.login };
    throw error;
  }
}

const signupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.email().transform((v) => v.toLowerCase()),
  password: z.string().min(10).max(200),
});

/**
 * Alta de cuenta. Sólo con `SIGNUP_ENABLED=true`: la app es pública en internet y cada cuenta es
 * una colección aparte, así que el registro se abre para sumar a alguien y se vuelve a cerrar.
 * La cuenta nueva arranca en el idioma con que se registró (el del navegador).
 */
export async function signupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const locale = await getLocale();
  const t = messages[locale];
  if (!(await signupEnabled())) return { error: t.errors.signupClosed };
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return { error: field === "email" ? t.errors.badEmail : field === "password" ? t.errors.shortPassword : t.errors.nameMissing };
  }

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, parsed.data.email)).limit(1);
  if (existing) return { error: t.errors.emailTaken };

  const { hash, salt } = await hashPassword(parsed.data.password);
  await db.insert(users).values({ name: parsed.data.name, email: parsed.data.email, passwordHash: hash, passwordSalt: salt, locale });

  await signIn("credentials", { email: parsed.data.email, password: parsed.data.password, redirectTo: "/" });
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}

/** Cambia el idioma de la app para este usuario. Se guarda en su cuenta: vale en cualquier dispositivo. */
export async function setLocaleAction(locale: string): Promise<void> {
  const userId = await requireUserId();
  if (!isLocale(locale)) return;
  await db.update(users).set({ locale }).where(eq(users.id, userId));
  revalidatePath("/", "layout");
}
