"use server";

import { eq } from "drizzle-orm";
import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn, signOut } from "@/lib/auth/auth";
import { hashPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

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
    if (error instanceof AuthError) return { error: "Email o contraseña incorrectos" };
    throw error;
  }
}

const signupSchema = z.object({
  name: z.string().trim().min(1, "Falta el nombre").max(80),
  email: z.email("Email inválido").transform((v) => v.toLowerCase()),
  password: z.string().min(10, "La contraseña tiene que tener al menos 10 caracteres").max(200),
});

/**
 * Alta de cuenta. Sólo con `SIGNUP_ENABLED=true`: la app es pública en internet y cada cuenta es
 * una colección aparte, así que el registro se abre para sumar a alguien y se vuelve a cerrar.
 */
export async function signupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await signupEnabled())) return { error: "El registro está cerrado" };
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, parsed.data.email)).limit(1);
  if (existing) return { error: "Ya hay una cuenta con ese email" };

  const { hash, salt } = await hashPassword(parsed.data.password);
  await db.insert(users).values({ name: parsed.data.name, email: parsed.data.email, passwordHash: hash, passwordSalt: salt });

  await signIn("credentials", { email: parsed.data.email, password: parsed.data.password, redirectTo: "/" });
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
